const ALPHABET = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index));
const DIGITS = Array.from({ length: 10 }, (_, index) => String(index));

export type ExpansionQueries = {
  queries: string[];
  truncated: boolean;
  /** Query uniche generate e non eseguite perché oltre il limite. */
  skippedQueries: number;
};

/**
 * Genera le query a livelli: le basi di tutte le seed, poi i pattern, le lettere a..z e le cifre 0..9.
 * Dentro ogni livello il giro è round-robin (variante 1 per tutte le seed, poi variante 2, ...), così
 * con il limite ogni seed riceve la stessa quota. Duplicati rimossi conservando la prima occorrenza.
 */
export function buildExpansionQueries(params: {
  seeds: string[];
  expandAlpha: boolean;
  expandNumeric: boolean;
  expandPatterns: boolean;
  patterns: string[];
  limit: number;
}): ExpansionQueries {
  const { seeds, expandAlpha, expandNumeric, expandPatterns, patterns, limit } = params;
  const levels: ((seed: string) => string)[][] = [[(seed) => seed]];

  if (expandPatterns) {
    levels.push(patterns.map((pattern) => (seed: string) => pattern.replaceAll("{seed}", seed)));
  }

  if (expandAlpha) {
    levels.push(ALPHABET.map((letter) => (seed: string) => `${seed} ${letter}`));
  }

  if (expandNumeric) {
    levels.push(DIGITS.map((digit) => (seed: string) => `${seed} ${digit}`));
  }

  const output = new Set<string>();
  for (const variants of levels) {
    for (const variant of variants) {
      for (const seed of seeds) {
        output.add(variant(seed));
      }
    }
  }

  const all = Array.from(output);
  const queries = all.slice(0, limit);
  return { queries, truncated: queries.length < all.length, skippedQueries: all.length - queries.length };
}
