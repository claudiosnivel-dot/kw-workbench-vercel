import { AiTitlesError } from "@/lib/ai/errors";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { keywordWords } from "@/lib/modules/strategy/cluster";
import { MAX_H2, MAX_TITLE_LENGTH, type TitlePage } from "@/lib/modules/strategy/titles";

/** Oltre questa lunghezza la risposta non si analizza (max_tokens 1200 ne produce molto meno). */
const MAX_CONTENT_LENGTH = 20_000;

const HTML_TAG = /<[^>]*>/g;
const CONTROL = /\p{Cc}/gu;
const FORMAT = /\p{Cf}/gu;

function invalid(reason: string): AiTitlesError {
  return new AiTitlesError("AI_INVALID_RESPONSE", `Risposta del modello non valida: ${reason}`);
}

/** Indice della graffa che chiude quella in start, saltando le stringhe JSON; -1 se non si chiude. */
function closingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Primo oggetto JSON del testo, anche dopo una frase o dentro un blocco di codice; null se non ce n'è. */
function firstJsonObject(content: string): Record<string, unknown> | null {
  for (let start = content.indexOf("{"); start !== -1; start = content.indexOf("{", start + 1)) {
    const end = closingBrace(content, start);
    if (end === -1) continue;
    try {
      const value: unknown = JSON.parse(content.slice(start, end + 1));
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Non è JSON: si prova dalla graffa successiva.
    }
  }
  return null;
}

/** Titolo ripulito: senza tag HTML, caratteri di controllo o invisibili, spazi ripetuti e '#' iniziali. */
function cleanTitle(value: string): string {
  return value
    .replace(HTML_TAG, " ")
    .replace(CONTROL, " ")
    .replace(FORMAT, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^#+\s*/, "");
}

const tooLong = (title: string) => Array.from(title).length > MAX_TITLE_LENGTH;

/**
 * Proposta del modello per la pagina (T-3502): H1 non vuoto, entro 200 caratteri e con tutte le parole della keyword
 * principale (keywordWords di T-1901); da 1 al massimo di H2 della pagina dopo aver tolto vuoti e doppioni senza
 * distinzione di maiuscole, ciascuno entro 200 caratteri. Un controllo non superato → AI_INVALID_RESPONSE, mai un taglio.
 */
export function parseTitlesResponse(content: string, page: TitlePage, language: string): { h1: string; h2: string[] } {
  if (content.length > MAX_CONTENT_LENGTH) {
    throw invalid("testo troppo lungo");
  }
  const value = firstJsonObject(content);
  if (!value || typeof value.h1 !== "string" || !Array.isArray(value.h2) || !value.h2.every((item) => typeof item === "string")) {
    throw invalid("manca un oggetto JSON { h1, h2 }");
  }

  const h1 = cleanTitle(value.h1);
  if (!h1 || tooLong(h1)) {
    throw invalid("H1 vuoto o troppo lungo");
  }
  const h1Words = keywordWords(canonicalizeKeyword(h1, language), language);
  if (![...keywordWords(page.main.canonical, language)].every((word) => h1Words.has(word))) {
    throw invalid("H1 senza la keyword principale");
  }

  const seen = new Set<string>();
  const h2: string[] = [];
  for (const title of (value.h2 as string[]).map(cleanTitle)) {
    const key = title.toLowerCase();
    if (title && !seen.has(key)) {
      seen.add(key);
      h2.push(title);
    }
  }
  if (h2.length === 0 || h2.length > MAX_H2[page.kind] || h2.some(tooLong)) {
    throw invalid(`servono da 1 a ${MAX_H2[page.kind]} H2 entro ${MAX_TITLE_LENGTH} caratteri`);
  }
  return { h1, h2 };
}
