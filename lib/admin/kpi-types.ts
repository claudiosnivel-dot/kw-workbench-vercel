import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";

/**
 * Indicatori aggregati della piattaforma (T-1705): solo numeri, nessun dato dei progetti degli utenti. Modulo senza
 * Prisma: lo leggono anche i componenti (D-22).
 */
export type PlatformKpi = {
  users: { total: number; active: number; suspended: number };
  workspaces: { total: number };
  subscriptions: { byPlan: Record<string, number>; byStatus: Record<SubscriptionStatus, number> };
  /** MRR stimato per codice valuta, in unità minima, senza conversione. */
  mrr: Record<string, number>;
  extractionsPerDay: { date: string; count: number }[];
  /** failed / (completed + failed) dei job creati negli ultimi 7 giorni; null senza job conclusi. */
  failedJobRate7d: number | null;
};
