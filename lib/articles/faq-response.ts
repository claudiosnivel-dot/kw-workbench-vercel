import { AiTitlesError } from "@/lib/ai/errors";
import { cleanTitle, firstJsonObject } from "@/lib/ai/titles-response";
import { markdownWords, sanitizeSectionMarkdown } from "@/lib/articles/markdown-sanitizer";

/*
 * Controllo deterministico delle domande frequenti restituite dal modello (T-4202): da 3 a 6 coppie, domande entro 150
 * caratteri chiuse dal punto interrogativo, risposte pulite come i blocchi (T-4201, senza link né tabelle, T-5501) e da
 * 20 a 120 parole. Un controllo non superato → AI_INVALID_RESPONSE, e il motore prova il modello successivo (T-3802).
 */

/** Oltre questa lunghezza la risposta non si analizza (max_tokens 3000 ne produce molto meno). */
const MAX_CONTENT_LENGTH = 40_000;
const MIN_PAIRS = 3;
const MAX_PAIRS = 6;
const MAX_QUESTION = 150;
const MIN_ANSWER_WORDS = 20;
const MAX_ANSWER_WORDS = 120;
/** Nelle risposte nessun link interno: ogni link resta solo testo. */
const NO_LINKS: ReadonlyMap<string, string> = new Map();

export type FaqPair = { question: string; answer: string };

function invalid(reason: string): AiTitlesError {
  return new AiTitlesError("AI_INVALID_RESPONSE", `Domande frequenti non valide: ${reason}`);
}

/** Domanda su una riga, senza HTML, link né segni del Markdown; entro 150 caratteri e chiusa da '?'. */
function parseQuestion(value: unknown): string {
  const question =
    typeof value === "string"
      ? cleanTitle(value.replace(/\[([^[\]]*)\]\([^()]*\)/g, "$1"))
          .replace(/[*_`]/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  if (!question || Array.from(question).length > MAX_QUESTION || !question.endsWith("?")) {
    throw invalid(`domanda vuota, oltre ${MAX_QUESTION} caratteri o senza il punto interrogativo`);
  }
  return question;
}

function parseAnswer(value: unknown): string {
  const answer = sanitizeSectionMarkdown(typeof value === "string" ? value : "", NO_LINKS, { tables: false });
  const words = markdownWords(answer).length;
  if (words < MIN_ANSWER_WORDS || words > MAX_ANSWER_WORDS) throw invalid(`risposta di ${words} parole`);
  return answer;
}

/** Coppie domanda e risposta del modello (T-4202), da 3 a 6, controllate e pulite; altrimenti AI_INVALID_RESPONSE. */
export function parseFaqResponse(content: string): FaqPair[] {
  if (content.length > MAX_CONTENT_LENGTH) throw invalid("testo troppo lungo");
  const items = firstJsonObject(content)?.faq;
  if (!Array.isArray(items) || items.length < MIN_PAIRS || items.length > MAX_PAIRS) {
    throw invalid(`servono da ${MIN_PAIRS} a ${MAX_PAIRS} coppie in faq`);
  }
  return items.map((item: unknown) => {
    const pair = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return { question: parseQuestion(pair.question), answer: parseAnswer(pair.answer) };
  });
}

/** Corpo del blocco FAQ in Markdown: ogni domanda in grassetto seguita dalla sua risposta. */
export function faqMarkdown(pairs: FaqPair[]): string {
  return pairs.map(({ question, answer }) => `**${question}**\n\n${answer}`).join("\n\n");
}
