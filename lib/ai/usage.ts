/*
 * Uso dei modelli gratuiti di OpenRouter per il root admin (T-3902, D-46): tipi del contatore per modello, senza accesso
 * al DB, così li importa anche la card delle Impostazioni. I numeri arrivano dal registro ai_requests (T-3901).
 */

/**
 * Massimo di ogni limite delle impostazioni (minimo 1): il tetto della piattaforma in richieste delle ultime 24 ore
 * (T-3901), il limite per workspace in proposte (T-3501), in articoli e in sezioni riscritte (T-4002).
 */
export const AI_LIMIT_MAX = {
  platformDailyRequests: 5000,
  workspaceDailyLimit: 1000,
  articlesPerWorkspaceDaily: 1000,
  sectionRewritesPerWorkspaceDaily: 1000,
} as const;

/** Tentativi di un modello in una finestra: riusciti, fornitore occupato, limite giornaliero dell'account e il resto. */
export type UsageCounts = {
  requests: number;
  ok: number;
  providerBusy: number;
  accountDailyLimit: number;
  other: number;
  /** Durata media dei tentativi riusciti in millisecondi, arrotondata; null senza tentativi riusciti. */
  avgOkMs: number | null;
};

/** Un modello con righe negli ultimi 7 giorni: le ultime 24 ore e gli ultimi 7 giorni. */
export type ModelUsage = { model: string; last24h: UsageCounts; last7d: UsageCounts };

/**
 * Contatore della card: i modelli e le richieste delle ultime 24 ore contate dal tetto della piattaforma (quelle del
 * root admin escluse, come nel controllo), con il tetto.
 */
export type AiUsage = { models: ModelUsage[]; requests24h: number; limit: number };
