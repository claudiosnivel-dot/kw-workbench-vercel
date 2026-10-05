/** Sezione senza seed: l'estrazione fallisce prima di qualsiasi scrittura e i risultati esistenti restano (T-706). */
export class NoSeedsError extends Error {
  constructor(subprojectId: string) {
    super(`La sezione ${subprojectId} non ha seed`);
    this.name = "NoSeedsError";
  }
}
