/**
 * Ultimo argomento aperto di un progetto (T-2403): la pagina dell'argomento lo scrive nel browser e /projects/<id> lo
 * legge per riaprirlo. È solo un suggerimento: il server lo usa solo se è un argomento di quel progetto.
 */
export function lastTopicCookieName(projectId: string): string {
  return `titan_last_topic_${projectId}`;
}

/** Durata del cookie dell'ultimo argomento: 1 anno. */
export const LAST_TOPIC_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
