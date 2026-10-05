// Limiti dell'upload del file di Keyword Planner (T-910), condivisi da rotta e interfaccia: niente import
// solo-server qui, il componente client li mostra all'utente.

/** Dimensione massima del file caricato (CWE-400). */
export const PLANNER_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Estensioni ammesse: il file scaricato da Keyword Planner e la sua versione separata da tabulazioni. */
export const PLANNER_IMPORT_EXTENSIONS = [".csv", ".tsv"] as const;
