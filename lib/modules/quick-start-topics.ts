/** Voci al massimo nel campo dell'avvio rapido (T-3701, D-44): ognuna è una parola di partenza dello stesso argomento. */
export const QUICK_START_MAX_TOPICS = 5;

/**
 * Voci del campo dell'avvio rapido (T-3701): il testo diviso sulle virgole, ogni voce con gli spazi ripetuti e gli a
 * capo ridotti a uno spazio e senza spazi ai lati; le voci vuote e i doppioni senza distinzione di maiuscole si tolgono
 * (resta la prima scrittura). Pura: la usano la rotta e il modulo della home.
 */
export function splitQuickStartTopics(topic: string): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const part of topic.split(",")) {
    const value = part.replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      topics.push(value);
    }
  }
  return topics;
}
