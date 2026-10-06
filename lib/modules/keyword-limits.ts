// Limiti di Google Ads sulle keyword, comuni al caricamento in Keyword Planner (T-904) e all'endpoint Google Ads
// di DataForSEO (T-902): al massimo 80 caratteri e 10 parole per keyword.
// Fonti (guida di Keyword Planner e documentazione di DataForSEO): docs/METRICS-PROVIDERS.md.

export const KEYWORD_MAX_CHARACTERS = 80;
export const KEYWORD_MAX_WORDS = 10;

/** Motivo per cui la keyword supera i limiti di Google Ads, o null se li rispetta. */
export function keywordLimitIssue(keyword: string): "too_long" | "too_many_words" | null {
  if ([...keyword].length > KEYWORD_MAX_CHARACTERS) {
    return "too_long";
  }
  return keyword.trim().split(/\s+/).length > KEYWORD_MAX_WORDS ? "too_many_words" : null;
}
