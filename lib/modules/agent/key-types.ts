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
