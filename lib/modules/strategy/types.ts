/**
 * Tipi delle strategie hub and spoke (T-1901…T-1905) senza import di runtime: li usano il motore, le rotte e i
 * componenti (D-22: i componenti importano solo da qui, mai da moduli che raggiungono Prisma).
 */
import type { KeywordType, ScoreSource, SearchIntent } from "@/lib/generated/prisma/enums";

export const STRATEGY_CONTENT_TYPES = ["guide", "list", "comparison", "product_category", "faq", "local", "tool"] as const;
export type StrategyContentType = (typeof STRATEGY_CONTENT_TYPES)[number];

export type StrategyPageKind = "HUB" | "SPOKE";

/** Stato di scrittura di una pagina del piano (T-2501), nell'ordine del percorso. */
export const STRATEGY_PAGE_STATUSES = ["TODO", "WRITING", "PUBLISHED"] as const;
export type StrategyPageStatus = (typeof STRATEGY_PAGE_STATUSES)[number];
export type StrategyMode = "AUTO" | "EXPERT";

/** Categorie dei modificatori (lib/modules/strategy/modifiers.ts), nell'ordine in cui si riconoscono. */
export const MODIFIER_CATEGORIES = ["local", "tool", "comparison", "transactional", "informational"] as const;
export type ModifierCategory = (typeof MODIFIER_CATEGORIES)[number];

/**
 * Motivi del piano (T-1901): i primi cinque spiegano perché esiste una pagina (reason_code), MERGED_INTO_PILLAR le
 * keyword confluite nella pagina pilastro e UNASSIGNED le keyword senza hub. Ognuno ha il testo in strategy.reasons.
 */
export const STRATEGY_REASON_CODES = [
  "HUB_SEED",
  "HUB_TERM",
  "SPOKE_MODIFIER",
  "SPOKE_WORD",
  "SPOKE_QUESTION",
  "MERGED_INTO_PILLAR",
  "UNASSIGNED",
] as const;
export type StrategyReasonCode = (typeof STRATEGY_REASON_CODES)[number];

export type ReasonParams = Record<string, string | number>;
export type PlanReason = { code: StrategyReasonCode; params: ReasonParams };

/** Regole del raggruppamento (lib/modules/strategy/rules.ts). */
export type StrategyRules = {
  minKeywordsPerSpoke: number;
  minSpokeVolume: number;
  maxSpokesPerHub: number;
  questionSpokeVolume: number;
  questionsAs: "faq" | "spokes";
};

/** Limiti ammessi delle regole numeriche nella modalità esperta (lib/modules/strategy/rules.ts). */
export type StrategyRuleLimits = Record<Exclude<keyof StrategyRules, "questionsAs">, { min: number; max: number }>;

/** Keyword del perimetro in ingresso al motore: canonical è la forma canonica di T-702, unica nella strategia. */
export type StrategyKeywordInput = {
  sourceId: string | null;
  keyword: string;
  canonical: string;
  volume: number | null;
  score: number | null;
  scoreSource: ScoreSource;
  searchIntent: SearchIntent;
  keywordType: KeywordType;
  isQuestion: boolean;
  isLocal: boolean;
};

/** Pagina del piano: main e secondary sono forme canoniche, le secondarie in ordine di priorità. */
export type PlanPage = {
  ref: string;
  kind: StrategyPageKind;
  hubRef: string | null;
  contentType: StrategyContentType;
  priority: number;
  position: number;
  reason: PlanReason;
  main: string;
  secondary: string[];
};

/**
 * Hub ancorato della rigenerazione (T-2502): un hub del piano che resta com'è perché lui o un suo spoke è già in
 * scrittura o pubblicato. La sua keyword principale (forma canonica) vale come seed; open dice se la pagina pilastro
 * può ricevere keyword nuove (stato Da scrivere).
 */
export type PlanAnchor = { ref: string; main: string; open: boolean };

/**
 * Piano restituito da buildStrategyPlan: pagine nell'ordine di lavoro e keyword non assegnate per priorità; con le
 * ancore, le keyword nuove che vanno nella pagina pilastro di un hub ancorato (anchored, per ref dell'ancora).
 */
export type StrategyPlan = { pages: PlanPage[]; unassigned: string[]; anchored: { ref: string; secondary: string[] }[] };

/** Keyword di una strategia salvata, come la leggono pagina, export e PDF. */
export type StrategyKeywordView = {
  id: string;
  keyword: string;
  canonical: string;
  role: "MAIN" | "SECONDARY";
  volume: number | null;
  score: number | null;
  isQuestion: boolean;
};

/**
 * Proposta dei titoli con l'AI conservata nella pagina (T-3601, D-43): createdAt in ISO 8601, droppedH2 gli H2 validi
 * tenuti fuori oltre il massimo della pagina (T-3802, D-48), model il modello dell'elenco che ha risposto.
 */
export type StrategyAiProposal = { h1: string; h2: string[]; droppedH2: number; model: string; createdAt: string };

/** Pagina di una strategia salvata con le sue keyword (principale per prima, poi le secondarie per priorità). */
export type StrategyPageView = {
  id: string;
  kind: StrategyPageKind;
  hubPageId: string | null;
  h1: string;
  h2: string[];
  h1Edited: boolean;
  h2Edited: boolean;
  contentType: StrategyContentType;
  priority: number;
  position: number;
  reason: PlanReason;
  status: StrategyPageStatus;
  /** Istante dell'ultimo cambio di stato in ISO 8601, null se la pagina non l'ha mai cambiato. */
  statusChangedAt: string | null;
  /** Ultima proposta dell'AI non ancora usata né scartata (T-3602); sempre null nelle versioni precedenti. */
  aiProposal: StrategyAiProposal | null;
  keywords: StrategyKeywordView[];
};

/** Hub nell'ordine di lavoro: la pagina pilastro e i suoi spoke in ordine di position. */
export type StrategyHubView = { pillar: StrategyPageView; spokes: StrategyPageView[] };

export type StrategySummaryView = {
  id: string;
  name: string;
  mode: StrategyMode;
  language: string;
  createdAt: string;
  consideredCount: number;
  assignedCount: number;
  unassignedCount: number;
  truncated: boolean;
  version: number;
  /** Pagine del piano (T-2502: elenco delle versioni). */
  pageCount: number;
};

/** Strategia completa: sintesi, impostazioni, hub nell'ordine di lavoro e keyword non assegnate. */
export type StrategyView = StrategySummaryView & {
  projectId: string;
  settings: unknown;
  hubs: StrategyHubView[];
  unassigned: StrategyKeywordView[];
};
