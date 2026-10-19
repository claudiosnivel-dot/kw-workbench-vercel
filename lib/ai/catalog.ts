import { FREE_MODEL_ID, isCatalogStale, type CatalogModel, type ModelCatalog } from "@/lib/ai/models";
import { getOpenRouterBaseUrl } from "@/lib/env";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { logger } from "@/lib/observability/logger";

/*
 * Catalogo dei modelli gratuiti di OpenRouter (T-3803, D-46): GET {base}/models, pubblico e senza chiave, con la base
 * fissa di OpenRouter (lib/env.ts, mai presa da una richiesta: CWE-918). Si salvano in app_settings i soli modelli ':free'
 * a prezzo 0; una lettura non riuscita lascia il catalogo salvato com'era.
 */

const CATALOG_KEY = "AI_MODEL_CATALOG";
const CATALOG_TIMEOUT_MS = 10_000;
// Il catalogo di oggi ha qualche decina di modelli gratuiti: il limite protegge app_settings da una risposta anomala.
const MAX_CATALOG_MODELS = 200;

type RawModel = { id?: unknown; name?: unknown; context_length?: unknown; pricing?: unknown };

function isCatalogModel(value: unknown): value is CatalogModel {
  if (!value || typeof value !== "object") return false;
  const { id, name, contextLength } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    FREE_MODEL_ID.test(id) &&
    typeof name === "string" &&
    (contextLength === null || (typeof contextLength === "number" && Number.isFinite(contextLength)))
  );
}

/** Valore salvato → catalogo; assente o illeggibile → null, cioè catalogo mai letto (i modelli restano da verificare). */
function parseStoredCatalog(raw: string | undefined): ModelCatalog | null {
  if (raw === undefined) return null;
  try {
    const value = JSON.parse(raw) as { checkedAt?: unknown; free?: unknown };
    if (typeof value.checkedAt !== "string" || !Number.isFinite(Date.parse(value.checkedAt)) || !Array.isArray(value.free)) return null;
    return { checkedAt: value.checkedAt, free: value.free.filter(isCatalogModel) };
  } catch {
    return null;
  }
}

export async function readModelCatalog(): Promise<ModelCatalog | null> {
  const values = await getManySettingValues([CATALOG_KEY]);
  return parseStoredCatalog(values[CATALOG_KEY]);
}

/** Prezzo 0: prompt e completion presenti e ogni voce del prezzo uguale a zero. */
function isZeroPrice(pricing: unknown): boolean {
  if (!pricing || typeof pricing !== "object") return false;
  const prices = pricing as Record<string, unknown>;
  if (prices.prompt === undefined || prices.completion === undefined) return false;
  return Object.values(prices).every((price) => (typeof price === "string" || typeof price === "number") && Number(price) === 0);
}

function toCatalogModel(model: RawModel): CatalogModel | null {
  if (typeof model.id !== "string" || !FREE_MODEL_ID.test(model.id) || !isZeroPrice(model.pricing)) return null;
  return {
    id: model.id,
    name: typeof model.name === "string" ? model.name.slice(0, 200) : model.id,
    contextLength: typeof model.context_length === "number" && Number.isFinite(model.context_length) ? model.context_length : null,
  };
}

/** Modelli gratuiti della risposta; null se la risposta non ha la forma del catalogo o non contiene modelli gratuiti. */
function freeModelsOf(payload: unknown): CatalogModel[] | null {
  const data = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return null;
  const free = data
    .map((model: unknown) => (model && typeof model === "object" ? toCatalogModel(model as RawModel) : null))
    .filter((model): model is CatalogModel => model !== null)
    .slice(0, MAX_CATALOG_MODELS);
  return free.length > 0 ? free : null;
}

async function fetchFreeModels(): Promise<{ free: CatalogModel[] } | { status: number | null; reason: string }> {
  let response: Response;
  try {
    response = await fetch(`${getOpenRouterBaseUrl()}/models`, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) });
  } catch (error) {
    return { status: null, reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network" };
  }
  if (!response.ok) return { status: response.status, reason: "http_status" };
  const free = freeModelsOf(await response.json().catch(() => null));
  return free ? { free } : { status: response.status, reason: "invalid_body" };
}

/**
 * Rilegge il catalogo (cron notturno e card del root admin): riuscita → salvato con checkedAt; non riuscita → resta
 * quello salvato e il log ai_catalog_refresh_failed riporta solo status e motivo.
 */
export async function refreshModelCatalog(now: Date = new Date()): Promise<{ refreshed: boolean; catalog: ModelCatalog | null }> {
  const result = await fetchFreeModels();
  if ("reason" in result) {
    logger.warn("ai_catalog_refresh_failed", { status: result.status, reason: result.reason });
    return { refreshed: false, catalog: await readModelCatalog() };
  }
  const catalog: ModelCatalog = { checkedAt: now.toISOString(), free: result.free };
  await upsertSettingValue({ key: CATALOG_KEY, value: JSON.stringify(catalog) });
  return { refreshed: true, catalog };
}

/** All'apertura della card: si rilegge solo un catalogo mai letto o più vecchio di un'ora. */
export async function refreshModelCatalogIfStale(now: Date = new Date()): Promise<void> {
  if (isCatalogStale(await readModelCatalog(), now.getTime())) {
    await refreshModelCatalog(now);
  }
}
