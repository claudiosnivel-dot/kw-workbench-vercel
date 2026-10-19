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

export type CatalogModel = { id: string; name: string; contextLength: number | null };
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

/** Stato di ogni modello dell'elenco, per ID. */
export function modelStatuses(models: string[], catalog: ModelCatalog | null): Record<string, ModelStatus> {
  return Object.fromEntries(models.map((id) => [id, modelStatus(id, catalog)]));
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
