import { revalidateTag, unstable_cache } from "next/cache";
import { writeAuditLog } from "@/lib/admin/audit";
import { getPlans, isPlansConfigured } from "@/lib/billing/plans";
import {
  getPaddleClientToken,
  getPaddlePriceId,
  getPaddleSettings,
  getPaddleWebhookSecret,
  getResendSettings,
  paddleSettingsIssues,
} from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { areLegalTextsPublished } from "@/lib/legal/version";
import { logger } from "@/lib/observability/logger";
import { isTurnstileReady } from "@/lib/security/turnstile";

/**
 * Interruttore del lancio commerciale (T-1606, D-32). In pausa nessun limite né quota, nessun acquisto e registrazione
 * pubblica chiusa; live attiva piani, abbonamenti, limiti e registrazione. Lo stato sta in app_settings
 * (COMMERCIAL_LAUNCH_STATUS) e si legge dalla cache dati di Next con un tag dedicato; assente o illeggibile vale paused.
 */

export const LAUNCH_STATUSES = ["paused", "live"] as const;
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];

export type LaunchState = { status: LaunchStatus; changedAt: string | null; changedBy: string | null };

const LAUNCH_SETTING_KEY = "COMMERCIAL_LAUNCH_STATUS";
const LAUNCH_CACHE_TAG = "commercial-launch";
const PAUSED: LaunchState = { status: "paused", changedAt: null, changedBy: null };

export function isLaunchStatus(value: unknown): value is LaunchStatus {
  return typeof value === "string" && (LAUNCH_STATUSES as readonly string[]).includes(value);
}

/** Valore salvato → stato; JSON malformato o status sconosciuto → paused (fail-safe, CWE-1188). */
function parseLaunchState(raw: string | undefined): LaunchState {
  if (raw === undefined) {
    return PAUSED;
  }
  try {
    const value = JSON.parse(raw) as { status?: unknown; changedAt?: unknown; changedBy?: unknown };
    if (!isLaunchStatus(value.status)) {
      return PAUSED;
    }
    return {
      status: value.status,
      changedAt: typeof value.changedAt === "string" ? value.changedAt : null,
      changedBy: typeof value.changedBy === "string" ? value.changedBy : null,
    };
  } catch {
    return PAUSED;
  }
}

async function readLaunchState(): Promise<LaunchState> {
  const values = await getManySettingValues([LAUNCH_SETTING_KEY]);
  return parseLaunchState(values[LAUNCH_SETTING_KEY]);
}

// Un errore del DB non entra nella cache: la richiesta vale paused e la successiva riprova.
const readCachedLaunchState = unstable_cache(readLaunchState, ["commercial-launch-state"], { tags: [LAUNCH_CACHE_TAG] });

export async function getLaunchState(): Promise<LaunchState> {
  try {
    return await readCachedLaunchState();
  } catch (error) {
    logger.error("commercial_launch_read_failed", { error });
    return PAUSED;
  }
}

export async function getLaunchStatus(): Promise<LaunchStatus> {
  return (await getLaunchState()).status;
}

/** L'unica domanda dei task commerciali (T-1602…T-1605, T-1702, T-1703, T-1801, T-1802): lancio attivo? */
export async function isCommercialLive(): Promise<boolean> {
  return (await getLaunchStatus()) === "live";
}

export const LAUNCH_CHECKLIST_ITEMS = ["plans", "paddle", "email", "legal", "captcha"] as const;
export type LaunchChecklistItemId = (typeof LAUNCH_CHECKLIST_ITEMS)[number];
export type LaunchChecklistItem = { id: LaunchChecklistItemId; ok: boolean; requires: string };

/**
 * Paddle pronto (T-1602): ambiente, chiave API, segreto dei webhook e client token presenti e coerenti, e un price id
 * valido per ogni intervallo di ogni piano pubblico a pagamento.
 */
function isPaddleReady(): boolean {
  if (!getPaddleSettings() || !getPaddleWebhookSecret() || !getPaddleClientToken() || paddleSettingsIssues(process.env).length > 0) {
    return false;
  }
  return Object.values(getPlans())
    .filter((plan) => plan.public)
    .every((plan) => Object.values(plan.priceEnv).every((name) => getPaddlePriceId(name) !== null));
}

// Cosa soddisfa ogni voce: task, decisione o variabili (mostrato nella card dell'admin, mai un valore).
const REQUIREMENTS: Record<LaunchChecklistItemId, string> = {
  plans: "D-14 · lib/billing/plans.ts",
  paddle: "PADDLE_ENV, PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, PADDLE_PRICE_*",
  email: "RESEND_API_KEY, EMAIL_FROM (D-11)",
  legal: "T-1803 · D-15",
  captcha: "T-1702 · TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY",
};

/**
 * Checklist del lancio, calcolata solo lato server (T-1606): per ogni voce solo se è soddisfatta, mai un valore delle
 * variabili (CWE-200). Una voce il cui task non è ancora costruito risulta mancante.
 */
export function getLaunchChecklist(): LaunchChecklistItem[] {
  const checks: Record<LaunchChecklistItemId, () => boolean> = {
    plans: isPlansConfigured,
    paddle: isPaddleReady,
    email: () => getResendSettings() !== null,
    legal: areLegalTextsPublished,
    captcha: isTurnstileReady,
  };
  return LAUNCH_CHECKLIST_ITEMS.map((id) => ({ id, ok: checks[id](), requires: REQUIREMENTS[id] }));
}

/** 409 del lancio con la checklist incompleta: missing elenca le voci mancanti. */
export class LaunchNotReadyError extends AppError {
  constructor(missing: LaunchChecklistItemId[]) {
    super(409, "LAUNCH_NOT_READY", "La checklist del lancio commerciale non è completa", { missing });
    this.name = "LaunchNotReadyError";
  }
}

/**
 * Cambia lo stato del lancio (solo root admin, verificato dalla rotta): live richiede la checklist completa, altrimenti
 * 409 LAUNCH_NOT_READY e stato invariato; paused è sempre ammesso. Ogni cambio scrive nella stessa transazione una riga
 * launch.update del registro delle azioni admin con attore, stato precedente e nuovo (T-1704), e invalida la cache.
 */
export async function setLaunchStatus(
  actor: { id: string; email: string | null },
  status: LaunchStatus,
  ip: string | null = null
): Promise<LaunchState> {
  if (status === "live") {
    const missing = getLaunchChecklist()
      .filter((item) => !item.ok)
      .map((item) => item.id);
    if (missing.length > 0) {
      throw new LaunchNotReadyError(missing);
    }
  }

  const previous = await readLaunchState();
  const next: LaunchState = { status, changedAt: new Date().toISOString(), changedBy: actor.email ?? actor.id };
  await prisma.$transaction([
    upsertSettingValue({ key: LAUNCH_SETTING_KEY, value: JSON.stringify(next) }),
    writeAuditLog(prisma, {
      actorUserId: actor.id,
      action: "launch.update",
      targetType: "launch",
      metadata: { status: { before: previous.status, after: status } },
      ip,
    }),
  ]);
  // expire 0: nessuna richiesta successiva riceve lo stato precedente.
  revalidateTag(LAUNCH_CACHE_TAG, { expire: 0 });
  return next;
}
