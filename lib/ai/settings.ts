import { writeAuditLog } from "@/lib/admin/audit";
import { getOpenRouterSettings } from "@/lib/env";
import { AppError, ValidationError } from "@/lib/http/errors";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

/**
 * Impostazioni dei titoli con l'AI (T-3501, D-42), cifrate in app_settings come le altre: funzione accesa o spenta,
 * modello gratuito di OpenRouter, tetto della piattaforma e limite per workspace nelle ultime 24 ore. Le cambia solo il
 * root admin (verificato dalla rotta); la chiave resta nell'ambiente del server e qui si dice solo se c'è.
 */

export type AiTitlesSettings = { enabled: boolean; model: string; platformDailyLimit: number; workspaceDailyLimit: number };
type AiTitlesView = AiTitlesSettings & { keyConfigured: boolean; used24h: number };

const SETTINGS_KEY = "AI_TITLES_SETTINGS";

/**
 * Default: funzione spenta, un modello gratuito disponibile su OpenRouter alla costruzione (2026-10-17) e i tetti scelti
 * per l'account gratuito (D-42), gli stessi max delle regole aiTitlesPlatform e aiTitlesWorkspace del rate limit.
 */
const DEFAULTS: AiTitlesSettings = {
  enabled: false,
  model: "google/gemma-4-31b-it:free",
  platformDailyLimit: 45,
  workspaceDailyLimit: 10,
};

const LIMIT_FIELDS = ["platformDailyLimit", "workspaceDailyLimit"] as const;
const MAX_LIMIT = 1000;

/** Chiave del rate limit della piattaforma (T-3601): i suoi tentativi sono le proposte partite verso OpenRouter. */
export const AI_TITLES_PLATFORM_KEY = "ai-titles:platform";

// ID di OpenRouter «autore/modello:free»: solo i modelli gratuiti non spendono i crediti dell'account (D-42).
const FREE_MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,127}:free$/i;

function isLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT;
}

/** Valore salvato → impostazioni: assente o illeggibile → i default, un campo non valido → il suo default (CWE-1188). */
function parseSettings(raw: string | undefined): AiTitlesSettings {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === undefined ? null : JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      value = parsed as Record<string, unknown>;
    }
  } catch {
    return { ...DEFAULTS };
  }
  return {
    enabled: value.enabled === true,
    model: typeof value.model === "string" && FREE_MODEL_ID.test(value.model) ? value.model : DEFAULTS.model,
    platformDailyLimit: isLimit(value.platformDailyLimit) ? value.platformDailyLimit : DEFAULTS.platformDailyLimit,
    workspaceDailyLimit: isLimit(value.workspaceDailyLimit) ? value.workspaceDailyLimit : DEFAULTS.workspaceDailyLimit,
  };
}

export async function getAiTitlesSettings(): Promise<AiTitlesSettings> {
  const values = await getManySettingValues([SETTINGS_KEY]);
  return parseSettings(values[SETTINGS_KEY]);
}

/** Funzione accesa e chiave presente (T-3603): la pagina del piano mostra «Migliora i titoli con l'AI». */
export async function isAiTitlesAvailable(): Promise<boolean> {
  return getOpenRouterSettings() !== null && (await getAiTitlesSettings()).enabled;
}

/** Proposte delle ultime 24 ore: i tentativi della chiave della piattaforma ancora dentro la finestra della regola. */
async function countUsedInWindow(now: Date): Promise<number> {
  const since = new Date(now.getTime() - rateLimitRules().aiTitlesPlatform.windowSeconds * 1000);
  return prisma.rateLimitHit.count({ where: { key: AI_TITLES_PLATFORM_KEY, created_at: { gt: since } } });
}

/** Impostazioni per la card del root admin: la chiave solo come sì o no, mai il valore (CWE-312). */
export async function getAiTitlesView(): Promise<AiTitlesView> {
  const [settings, used24h] = await Promise.all([getAiTitlesSettings(), countUsedInWindow(new Date())]);
  return { ...settings, keyConfigured: getOpenRouterSettings() !== null, used24h };
}

/** Corpo della PATCH: solo i campi presenti, validati; un modello che non è un ID gratuito → 400 AI_MODEL_NOT_FREE. */
function parsePatch(body: unknown): Partial<AiTitlesSettings> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Il corpo deve essere un oggetto");
  }
  const input = body as Record<string, unknown>;
  const patch: Partial<AiTitlesSettings> = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      throw new ValidationError("enabled deve essere true o false");
    }
    patch.enabled = input.enabled;
  }
  if (input.model !== undefined) {
    const model = typeof input.model === "string" ? input.model.trim() : "";
    if (!FREE_MODEL_ID.test(model)) {
      throw new AppError(400, "AI_MODEL_NOT_FREE", "Il modello deve essere un ID gratuito di OpenRouter (autore/modello:free)");
    }
    patch.model = model;
  }
  for (const field of LIMIT_FIELDS) {
    const limit = input[field];
    if (limit !== undefined) {
      if (!isLimit(limit)) {
        throw new ValidationError(`${field} deve essere un intero tra 1 e ${MAX_LIMIT}`);
      }
      patch[field] = limit;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError("Nessuna impostazione da salvare");
  }
  return patch;
}

/**
 * Salva le impostazioni (solo root admin, verificato dalla rotta): nella stessa transazione una riga ai.update del
 * registro con i soli campi cambiati, prima e dopo (T-1704). Nessun campo cambiato: nessuna scrittura.
 */
export async function updateAiTitlesSettings(actor: { id: string }, body: unknown, ip: string | null = null): Promise<AiTitlesView> {
  const patch = parsePatch(body);
  const previous = await getAiTitlesSettings();
  const next: AiTitlesSettings = { ...previous, ...patch };
  const changed = (Object.keys(patch) as (keyof AiTitlesSettings)[]).filter((field) => previous[field] !== next[field]);
  if (changed.length > 0) {
    await prisma.$transaction([
      upsertSettingValue({ key: SETTINGS_KEY, value: JSON.stringify(next) }),
      writeAuditLog(prisma, {
        actorUserId: actor.id,
        action: "ai.update",
        targetType: "ai",
        metadata: Object.fromEntries(changed.map((field) => [field, { before: previous[field], after: next[field] }])),
        ip,
      }),
    ]);
  }
  return getAiTitlesView();
}
