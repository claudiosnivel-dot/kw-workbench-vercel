import { writeAuditLog } from "@/lib/admin/audit";
import { readModelCatalog } from "@/lib/ai/catalog";
import {
  addableModels,
  type CatalogModel,
  FREE_MODEL_ID,
  MAX_MODELS,
  type ModelCatalog,
  type ModelStatus,
  modelStatuses,
  sameModel,
} from "@/lib/ai/models";
import { getOpenRouterSettings } from "@/lib/env";
import { AppError, ValidationError } from "@/lib/http/errors";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

/**
 * Impostazioni dei titoli con l'AI (T-3501, D-42), cifrate in app_settings come le altre: funzione accesa o spenta,
 * elenco ordinato dei modelli gratuiti di OpenRouter (T-3801, D-46), tetto della piattaforma e limite per workspace
 * nelle ultime 24 ore. Le cambia solo il root admin (verificato dalla rotta); la chiave resta nell'ambiente del server e
 * qui si dice solo se c'è.
 */

export type AiTitlesSettings = { enabled: boolean; models: string[]; platformDailyLimit: number; workspaceDailyLimit: number };
type AiTitlesView = AiTitlesSettings & {
  keyConfigured: boolean;
  used24h: number;
  /** Catalogo di OpenRouter all'ultimo controllo riuscito (T-3803); null se mai letto. */
  catalog: ModelCatalog | null;
  statuses: Record<string, ModelStatus>;
  addable: CatalogModel[];
};

const SETTINGS_KEY = "AI_TITLES_SETTINGS";

/**
 * Elenco predefinito (T-3801): i modelli ':free' del catalogo che il 2026-10-19 hanno risposto al prompt dei titoli con
 * H1 e H2 validi, dal migliore (prova e criteri in docs/AI-TITLES.md).
 */
export const DEFAULT_AI_MODELS: readonly string[] = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "poolside/laguna-xs-2.1:free",
  "liquid/lfm-2.5-2.6b:free",
  "google/gemma-4-31b-it:free",
  "poolside/laguna-s-2.1:free",
];

/**
 * Default: funzione spenta, l'elenco predefinito e i tetti scelti per l'account gratuito (D-42), gli stessi max delle
 * regole aiTitlesPlatform e aiTitlesWorkspace del rate limit.
 */
const DEFAULTS: AiTitlesSettings = {
  enabled: false,
  models: [...DEFAULT_AI_MODELS],
  platformDailyLimit: 45,
  workspaceDailyLimit: 10,
};

const LIMIT_FIELDS = ["platformDailyLimit", "workspaceDailyLimit"] as const;
const MAX_LIMIT = 1000;

/** Chiave del rate limit della piattaforma (T-3601): i suoi tentativi sono le proposte partite verso OpenRouter. */
export const AI_TITLES_PLATFORM_KEY = "ai-titles:platform";

function isLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT;
}

const hasDuplicates = (models: string[]) => models.some((id, index) => models.findIndex((other) => sameModel(other, id)) !== index);

/** Elenco salvato valido: da 1 a 8 ID gratuiti distinti; altrimenti null. */
function storedModels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MODELS) return null;
  if (!value.every((id): id is string => typeof id === "string" && FREE_MODEL_ID.test(id))) return null;
  return hasDuplicates(value) ? null : [...value];
}

const defaults = (): AiTitlesSettings => ({ ...DEFAULTS, models: [...DEFAULTS.models] });

/**
 * Valore salvato → impostazioni: assente o illeggibile → i default, un campo non valido → il suo default (CWE-1188). Un
 * valore salvato prima di T-3801, con il solo model, si legge come l'elenco [model].
 */
function parseSettings(raw: string | undefined): AiTitlesSettings {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === undefined ? null : JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      value = parsed as Record<string, unknown>;
    }
  } catch {
    return defaults();
  }
  const legacyModel = typeof value.model === "string" && FREE_MODEL_ID.test(value.model) ? [value.model] : null;
  return {
    enabled: value.enabled === true,
    models: storedModels(value.models) ?? legacyModel ?? defaults().models,
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

/**
 * Impostazioni per la card del root admin: la chiave solo come sì o no, mai il valore (CWE-312); stato di ogni modello
 * sul catalogo salvato e modelli gratuiti del catalogo non ancora nell'elenco (T-3803).
 */
export async function getAiTitlesView(): Promise<AiTitlesView> {
  const [settings, used24h, catalog] = await Promise.all([getAiTitlesSettings(), countUsedInWindow(new Date()), readModelCatalog()]);
  return {
    ...settings,
    keyConfigured: getOpenRouterSettings() !== null,
    used24h,
    catalog,
    statuses: modelStatuses(settings.models, catalog),
    addable: addableModels(settings.models, catalog),
  };
}

/**
 * Elenco della PATCH (T-3801): un array di 1-8 stringhe distinte senza distinzione di maiuscole (400 VALIDATION_ERROR),
 * ciascuna un ID gratuito (400 AI_MODEL_NOT_FREE).
 */
function parseModels(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) {
    throw new ValidationError("models deve essere un elenco di ID di modelli");
  }
  const models = value.map((id: string) => id.trim());
  if (models.length === 0 || models.length > MAX_MODELS) {
    throw new ValidationError(`models deve avere da 1 a ${MAX_MODELS} modelli`);
  }
  if (!models.every((id) => FREE_MODEL_ID.test(id))) {
    throw new AppError(400, "AI_MODEL_NOT_FREE", "Ogni modello deve essere un ID gratuito di OpenRouter (autore/modello:free)");
  }
  if (hasDuplicates(models)) {
    throw new ValidationError("models non può contenere due volte lo stesso modello");
  }
  return models;
}

/** Corpo della PATCH: solo i campi presenti, validati; model, il campo di prima di T-3801, non è più accettato. */
function parsePatch(body: unknown): Partial<AiTitlesSettings> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Il corpo deve essere un oggetto");
  }
  const input = body as Record<string, unknown>;
  if (input.model !== undefined) {
    throw new ValidationError("model non è più accettato: usa models, l'elenco ordinato dei modelli");
  }
  const patch: Partial<AiTitlesSettings> = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      throw new ValidationError("enabled deve essere true o false");
    }
    patch.enabled = input.enabled;
  }
  if (input.models !== undefined) {
    patch.models = parseModels(input.models);
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

/** Stesso valore di un campo: per l'elenco conta anche l'ordine. */
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Salva le impostazioni (solo root admin, verificato dalla rotta): nella stessa transazione una riga ai.update del
 * registro con i soli campi cambiati, prima e dopo (T-1704). Nessun campo cambiato: nessuna scrittura.
 */
export async function updateAiTitlesSettings(actor: { id: string }, body: unknown, ip: string | null = null): Promise<AiTitlesView> {
  const patch = parsePatch(body);
  const previous = await getAiTitlesSettings();
  const next: AiTitlesSettings = { ...previous, ...patch };
  const changed = (Object.keys(patch) as (keyof AiTitlesSettings)[]).filter((field) => !sameValue(previous[field], next[field]));
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
