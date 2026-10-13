/**
 * Valori della pagina delle keyword senza import server (T-2401, T-2403): li usano anche i componenti client.
 * status: tenute o scartate (regola unica di lib/modules/keep-rule.ts); chip: filtri rapidi; sort: ordinamenti.
 */
export const KEEP_STATUSES = ["kept", "discarded"] as const;
export type KeepStatus = (typeof KEEP_STATUSES)[number];

export const KEYWORD_CHIPS = ["questions", "buy", "local", "brands"] as const;
export type KeywordChip = (typeof KEYWORD_CHIPS)[number];

export const KEYWORD_SORTS = ["promising", "searches", "az"] as const;
export type KeywordSort = (typeof KEYWORD_SORTS)[number];

/**
 * Parametri di query che filtrano la vista (chip, cerca, pannello Filtri e i filtri dei vecchi indirizzi /results): con
 * almeno uno attivo compaiono «Tieni queste N» e «Scarta queste N» e, nella finestra Esporta, «Solo quelle che vedi ora».
 */
export const VIEW_FILTER_PARAMS = [
  "chip",
  "searchText",
  "minVolume",
  "maxVolume",
  "searchIntent",
  "keywordType",
  "brandStatus",
  "questionOnly",
  "toolIntentOnly",
  "commercialOnly",
] as const;

/** Riga dell'elenco delle keyword passata ai componenti (T-2403): solo i campi mostrati, valori tecnici grezzi. */
export type KeywordRowData = {
  id: string;
  keyword: string;
  /** Nome dell'argomento, solo nella vista del progetto (colonna Argomento). */
  topicName: string | null;
  searches: number | null;
  /** Punteggio 0-100 della barra Potenziale; null se non calcolato. */
  score: number | null;
  question: boolean;
  /** Intento commerciale o transazionale. */
  buy: boolean;
  local: boolean;
  /** Marchio da controllare (brand_status review). */
  brandReview: boolean;
  source: string;
  intent: string;
  type: string;
  competition: number | null;
  discarded: boolean;
};

/** Colonne facoltative dell'elenco, nascoste di default (T-2403). */
export const OPTIONAL_KEYWORD_COLUMNS = ["source", "intent", "type", "competition", "score"] as const;
export type OptionalKeywordColumn = (typeof OPTIONAL_KEYWORD_COLUMNS)[number];
