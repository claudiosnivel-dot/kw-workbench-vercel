/** Durate della chiave di Claude Code fra cui sceglie il root admin (T-7101, D-64): giorni, oppure «Mai». */
export const AGENT_KEY_DURATIONS = [30, 60, 90, "never"] as const;

export type AgentKeyDuration = (typeof AGENT_KEY_DURATIONS)[number];

/** Durata preselezionata nella card (T-7102). */
export const DEFAULT_AGENT_KEY_DURATION: AgentKeyDuration = 90;

/**
 * Stato dell'ultima chiave del root admin (T-7101), senza la chiave: prefisso, istanti in ISO (expiresAt null per «Mai»,
 * lastUsedAt null se mai usata, revokedAt null se non revocata) e active se non è né revocata né scaduta.
 */
export type AgentKeyStatus = {
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  active: boolean;
};

/** Risposta della creazione: la chiave in chiaro, l'unica volta in cui esce da Titan SEO, e il suo stato. */
export type CreatedAgentKey = { key: string; status: AgentKeyStatus };

/** Tetto giornaliero di spesa di Claude Code (T-7302, D-65): 2 $ di default, modificabile nella card da 0 a 100 $. */
export const AGENT_DAILY_CAP_DEFAULT_USD = 2;
export const AGENT_DAILY_CAP_MAX_USD = 100;

/** Spesa di oggi (giorno UTC) delle richieste a pagamento dei lavori di Claude Code e tetto, in dollari. */
export type AgentSpend = { spentTodayUsd: number; capUsd: number };

/** Chiamate di Claude Code nella card «Claude Code» (T-7602): le ultime 50, dalla più recente. */
export const AGENT_ACTIVITY_LIMIT = 50;

/**
 * Chiamata registrata in agent_calls (T-7201), come la mostra la card: istante in ISO, strumento, progetto se esiste
 * ancora, esito (errorCode null se riuscita) e durata; mai input o risposta (CWE-532).
 */
export type AgentCallView = {
  id: string;
  at: string;
  tool: string;
  project: { id: string; name: string } | null;
  ok: boolean;
  errorCode: string | null;
  durationMs: number;
};

/** Attività di Claude Code della card e di GET /api/admin/agent-key: ultime chiamate e spesa di oggi con il tetto. */
export type AgentActivity = { calls: AgentCallView[]; spend: AgentSpend };
