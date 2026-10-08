/**
 * Uso del workspace mostrato dalla pagina di fatturazione e restituito da GET /api/billing/usage (T-1703). Modulo senza
 * import: lo leggono anche i componenti, che non raggiungono Prisma (D-22).
 */
export type UsageSummary = {
  runsToday: number;
  runsPerDay: number | null;
  keywordsThisMonth: number;
  keywordsPerMonth: number | null;
  resetAt: { runs_day: string; keywords_month: string };
};
