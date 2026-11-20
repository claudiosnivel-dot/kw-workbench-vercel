/** Voci al massimo nel campo dell'avvio rapido (T-3701, D-44): ognuna è una parola di partenza dello stesso argomento. */
export const QUICK_START_MAX_TOPICS = 5;

/**
 * Parole di partenza con gli spazi ripetuti e gli a capo ridotti a uno spazio e senza spazi ai lati; le vuote e i
 * doppioni senza distinzione di maiuscole si tolgono (resta la prima scrittura). Pura: la usano l'avvio rapido e gli
 * strumenti di Claude Code (T-7301).
 */
export function uniqueSeeds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const seeds: string[] = [];
  for (const part of values) {
    const value = part.replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      seeds.push(value);
    }
  }
  return seeds;
}

/**
 * Voci del campo dell'avvio rapido (T-3701): il testo diviso sulle virgole, ogni voce ripulita da uniqueSeeds. Pura: la
 * usano la rotta e il modulo della home.
 */
export function splitQuickStartTopics(topic: string): string[] {
  return uniqueSeeds(topic.split(","));
}
