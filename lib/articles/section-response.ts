import { AiTitlesError } from "@/lib/ai/errors";
import { hasKeywordWords } from "@/lib/ai/titles-response";
import { markdownWords, sanitizeSectionMarkdown } from "@/lib/articles/markdown-sanitizer";
import { type SectionInput, sectionBlock, sectionLinks } from "@/lib/articles/section-prompt";

/*
 * Controllo deterministico del testo di un blocco restituito dal modello (T-4201): pulizia del Markdown con i link delle
 * pagine del blocco e, per l'introduzione, la keyword principale nelle prime 100 parole. Un controllo non superato →
 * AI_INVALID_RESPONSE, e il motore prova il modello successivo (T-3802).
 */

/** Oltre questa lunghezza la risposta non si analizza (max_tokens 4000 ne produce molto meno). */
const MAX_CONTENT_LENGTH = 60_000;
/** La keyword principale deve comparire entro queste parole dell'introduzione. */
const INTRO_KEYWORD_WORDS = 100;

/**
 * Testo del blocco in Markdown semplice (T-4201): pulito da sanitizeSectionMarkdown con i soli link page: verso le pagine
 * del blocco, salvati con l'id della pagina del piano; l'introduzione con tutte le parole della keyword principale
 * (keywordWords di T-1901, in qualunque forma e ordine) nelle prime 100 parole.
 */
export function parseSectionResponse(content: string, input: SectionInput): string {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new AiTitlesError("AI_INVALID_RESPONSE", "Testo del blocco non valido: troppo lungo");
  }
  const body = sanitizeSectionMarkdown(content, sectionLinks(input));
  if (sectionBlock(input).kind === "INTRO") {
    const opening = markdownWords(body).slice(0, INTRO_KEYWORD_WORDS).join(" ");
    if (!hasKeywordWords(opening, input.plan.page.main.canonical, input.plan.language)) {
      throw new AiTitlesError("AI_INVALID_RESPONSE", "Testo del blocco non valido: introduzione senza la keyword principale nelle prime 100 parole");
    }
  }
  return body;
}
