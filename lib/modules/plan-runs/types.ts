/**
 * Tipi del lavoro di piano (T-6201, T-6202) senza import di runtime: li usano il motore, le rotte e i componenti (D-22:
 * i componenti importano solo da qui, mai da moduli che raggiungono Prisma).
 */

/** Fasi del lavoro di piano nell'ordine in cui si eseguono; done quando la strategia è salvata. */
export const PLAN_RUN_PHASES = ["volumes", "serps_post", "serps_collect", "classify", "cluster", "save"] as const;
export type PlanRunPhase = (typeof PLAN_RUN_PHASES)[number] | "done";

/**
 * Motivi salvati in grouping_notice (T-6201, T-6303): quelli dei volumi (MetricsNotice), un errore del fornitore, la
 * raccolta dei risultati di Google oltre i 10 minuti e i risultati per meno di metà delle keyword (raggruppamento di
 * riserva); l'AI che non ha risposto o non è attiva (luoghi e concorrenti dai soli riconoscimenti fissi, anche con i
 * risultati di Google come fonte).
 */
export const PLAN_NOTICES = [
  "PLAN_NO_LICENSED_METRICS",
  "PROVIDER_NOT_CONFIGURED",
  "LOCATION_UNSUPPORTED",
  "LANGUAGE_UNSUPPORTED",
  "METRICS_BUDGET_EXCEEDED",
  "RUN_BUDGET_EXCEEDED",
  "LICENSED_METRICS_QUOTA_EXCEEDED",
  "PROVIDER_ERROR",
  "SERP_TIMEOUT",
  "SERP_TOO_FEW",
  "AI_CLASSIFY_UNAVAILABLE",
  "AI_NOT_CONFIGURED",
] as const;
export type PlanNotice = (typeof PLAN_NOTICES)[number];

export type PlanRunStatus = "pending" | "running" | "completed" | "failed" | "canceled";

/** Stato del lavoro letto dalla pagina del piano (T-6202): fase, avanzamento, strategia salvata o codice d'errore. */
export type PlanRunView = {
  id: string;
  status: PlanRunStatus;
  phase: PlanRunPhase;
  progress: { done: number; total: number };
  strategyId: string | null;
  errorCode: string | null;
};

/** Il lavoro è ancora da finire: pending o running. */
export const isPlanRunActive = (status: PlanRunStatus): boolean => status === "pending" || status === "running";
