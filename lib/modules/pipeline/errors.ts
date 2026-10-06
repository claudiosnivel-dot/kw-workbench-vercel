/** Sezione senza seed: l'estrazione fallisce prima di qualsiasi scrittura e i risultati esistenti restano (T-706). */
export class NoSeedsError extends Error {
  constructor(subprojectId: string) {
    super(`La sezione ${subprojectId} non ha seed`);
    this.name = "NoSeedsError";
  }
}

/** Query di autocomplete fallite oltre la soglia (T-306): il job fallisce prima di toccare i risultati salvati. */
export class AutocompleteUnavailableError extends Error {
  constructor(failedQueries: number, totalQueries: number) {
    super(`Autocomplete non disponibile: ${failedQueries} query su ${totalQueries} fallite`);
    this.name = "AutocompleteUnavailableError";
  }
}
