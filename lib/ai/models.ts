/*
 * Elenco dei modelli gratuiti dei titoli con l'AI e stato di ciascuno sul catalogo di OpenRouter (T-3801, T-3803,
 * D-46). Solo funzioni pure, usate dal server e dalla card del root admin.
 */

/** ID di OpenRouter «autore/modello:free»: solo i modelli gratuiti non spendono i crediti dell'account (D-42). */
export const FREE_MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,127}:free$/i;

/** Modelli dell'elenco, dal primo da provare (D-46). */
export const MAX_MODELS = 8;

/** Oltre quest'età il catalogo si rilegge all'apertura della card (T-3803). */
export const CATALOG_MAX_AGE_MS = 3_600_000;

/** Indirizzo della card «Titoli con l'AI» nelle Impostazioni del root admin (T-3902, T-6403). */
export const AI_TITLES_CARD_HREF = "/admin/settings#ai-titles";

/**
 * Elenco predefinito (T-3801, rivisto da T-6403): i modelli ':free' provati in produzione con titoli e scaletta il
 * 2026-11-12 e ancora gratuiti nel catalogo del 2026-11-14, dal più affidabile (prove e criteri in docs/AI-TITLES.md;
 * da riprovare con npm run ai:probe). È anche il ripiego delle richieste quando nessun modello dell'elenco salvato è
 * più gratuito.
 */
export const DEFAULT_AI_MODELS: readonly string[] = [
  "baidu/ernie-5.5-flash-preview:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

/**
 * Token in più di max_tokens per i modelli che ragionano (T-6401, D-58): il ragionamento consuma lo spazio della
 * risposta (nemotron-3.5-super-vl il 2026-11-12 finiva i 4000 token della scaletta prima del JSON).
 */
export const REASONING_TOKEN_ALLOWANCE = 8000;

/**
 * reasoning true: supported_parameters di OpenRouter contiene reasoning, cioè il modello ragiona prima di rispondere
 * (T-6401). Assente nei cataloghi salvati prima di T-6401: il modello non riceve token in più finché il catalogo non si
 * rilegge (cron notturno o apertura della card).
 */
export type CatalogModel = { id: string; name: string; contextLength: number | null; reasoning?: boolean };
/** Modelli ':free' a prezzo 0 del catalogo di OpenRouter all'ultimo controllo riuscito. */
export type ModelCatalog = { checkedAt: string; free: CatalogModel[] };
/** ok nel catalogo e gratuito, missing assente o non più gratuito, unknown catalogo mai letto. */
export type ModelStatus = "ok" | "missing" | "unknown";

const keyOf = (id: string) => id.toLowerCase();

/** Stessi ID senza distinzione di maiuscole, come i doppioni dell'elenco. */
export function sameModel(a: string, b: string): boolean {
  return keyOf(a) === keyOf(b);
}

export function modelStatus(id: string, catalog: ModelCatalog | null): ModelStatus {
  if (!catalog) return "unknown";
  return catalog.free.some((entry) => sameModel(entry.id, id)) ? "ok" : "missing";
}

/** Modello del catalogo che ragiona (T-6401); con il catalogo mai letto o un modello assente, no. */
export function isReasoningModel(id: string, catalog: ModelCatalog | null): boolean {
  return catalog?.free.some((entry) => sameModel(entry.id, id) && entry.reasoning === true) ?? false;
}

/**
 * Modelli di una richiesta (T-6403): quelli dell'elenco non assenti dal catalogo; se lo sono tutti, i modelli
 * predefiniti presenti nel catalogo gratuito, nell'ordine, con fallback true (vuoto se non ce n'è nessuno). Con il
 * catalogo mai letto l'elenco resta com'è. L'elenco salvato non cambia mai da qui.
 */
export function requestModels(models: string[], catalog: ModelCatalog | null): { models: string[]; fallback: boolean } {
  const available = models.filter((id) => modelStatus(id, catalog) !== "missing");
  if (available.length > 0 || models.length === 0) return { models: available, fallback: false };
  return { models: DEFAULT_AI_MODELS.filter((id) => modelStatus(id, catalog) === "ok"), fallback: true };
}

/** Stato di ogni modello dell'elenco, per ID. */
export function modelStatuses(models: string[], catalog: ModelCatalog | null): Record<string, ModelStatus> {
  return Object.fromEntries(models.map((id) => [id, modelStatus(id, catalog)]));
}

/** Sotto questo numero di modelli dell'elenco disponibili o da verificare la Panoramica avvisa il root admin (T-3902). */
export const MIN_AVAILABLE_MODELS = 5;

/** Modelli dell'elenco disponibili o da verificare: tutti tranne quelli non più nel catalogo. */
export function countAvailableModels(statuses: ModelStatus[]): number {
  return statuses.filter((status) => status !== "missing").length;
}

/** Modelli ':free' del catalogo non ancora nell'elenco, nell'ordine del catalogo. */
export function addableModels(models: string[], catalog: ModelCatalog | null): CatalogModel[] {
  return (catalog?.free ?? []).filter((entry) => !models.some((id) => sameModel(id, entry.id)));
}

/** Catalogo mai letto o più vecchio di un'ora. */
export function isCatalogStale(catalog: ModelCatalog | null, now: number): boolean {
  if (!catalog) return true;
  const checkedAt = Date.parse(catalog.checkedAt);
  return !Number.isFinite(checkedAt) || now - checkedAt > CATALOG_MAX_AGE_MS;
}
