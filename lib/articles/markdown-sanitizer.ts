import { AiTitlesError } from "@/lib/ai/errors";

/*
 * Pulizia deterministica del testo di un blocco dell'articolo (T-4201, D-46): dal testo del modello resta Markdown
 * semplice, cioè paragrafi, grassetto, corsivo, elenchi, sottotitoli H3 e i link interni page: delle pagine del blocco.
 * Tutto il resto (HTML, titoli di livello 1 e 2, immagini, tabelle, codice, link esterni e indirizzi web) si toglie,
 * lasciando il testo dove ce n'è uno (CWE-79: editor ed export non ricevono HTML dal modello).
 */

/** Elementi che si tolgono con il loro contenuto. */
const RAW_ELEMENTS = /<(script|style|iframe|object|embed|noscript|template|textarea|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
/** Tag di blocco: diventano un a capo, così i paragrafi in HTML restano separati. */
const BLOCK_TAG = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|blockquote|section|article|hr)\b[^<>]*>/gi;
const ANY_TAG = /<\/?[a-z][^<>]*>|<![^<>]*>|<\?[^<>]*>/gi;
/** Resto di un tag non chiuso: '<' seguito da una lettera, '/', '!' o '?'. */
const TAG_OPENER = /<(?=[a-z/!?])/gi;
/** Caratteri di controllo tranne a capo e tabulazione. */
const CONTROL = /[^\P{Cc}\n\t]/gu;
const FORMAT = /\p{Cf}/gu;

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** Titolo ATX: da 1 a 6 '#' seguiti da uno spazio o dalla fine della riga (senza quantificatori pigri: CWE-1333). */
const HEADING = /^ {0,3}(#{1,6})(?=\s|$)/;
const CLOSING_HASHES = /(?:^|\s)#+$/;
const RULE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,}|=+)\s*$/;
const LINK_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*\S+/;
const BULLET = /^(\s*)[*+-]\s+/;
const ORDERED = /^\s*\d{1,3}[.)]\s+/;
const QUOTE = /^\s*(?:>\s?)+/;
// Il testo tra parentesi quadre non contiene altre parentesi quadre: una lunga fila di '[' resta lineare (CWE-1333).
const IMAGE = /!\[[^[\]]*\]\([^()]*\)|!\[[^[\]]*\]\[[^[\]]*\]/g;
const INLINE_LINK = /\[([^[\]]*)\]\(\s*<?([^()\s<>]*)>?(?:\s+["'(][^()]*["')])?\s*\)/g;
const BARE_URL = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>()[\]]+/gi;
const PAGE_LINK = /^page:(.+)$/;

function invalid(reason: string): AiTitlesError {
  return new AiTitlesError("AI_INVALID_RESPONSE", `Testo del blocco non valido: ${reason}`);
}

/** Un testo tutto dentro un recinto di codice (```markdown … ```) è il testo del blocco, senza il recinto. */
function unwrapFence(text: string): string {
  const lines = text.trim().split("\n");
  if (lines.length < 2 || !FENCE.test(lines[0])) return text;
  const end = FENCE.test(lines[lines.length - 1]) ? -1 : lines.length;
  return lines.slice(1, end).join("\n");
}

function stripHtml(text: string): string {
  return text.replace(RAW_ELEMENTS, "").replace(COMMENT, "").replace(BLOCK_TAG, "\n").replace(ANY_TAG, "").replace(TAG_OPENER, "");
}

/** Righe senza i blocchi di codice (recinti ``` o ~~~, anche non chiusi) e senza le tabelle. */
function dropCodeAndTables(lines: string[]): string[] {
  const kept: string[] = [];
  let fence: string | null = null;
  let inTable = false;
  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (marker) {
      fence = marker;
    } else if (TABLE_DELIMITER.test(line)) {
      // L'intestazione della tabella è la riga appena tenuta; le righe con '|' che seguono sono la tabella.
      if (kept.length > 0 && kept[kept.length - 1].includes("|")) kept.pop();
      inTable = true;
    } else if (!TABLE_ROW.test(line) && !(inTable && line.includes("|"))) {
      inTable = false;
      kept.push(line);
    }
  }
  return kept;
}

/** Testo della riga con i link: page: verso le pagine del blocco con l'id della pagina, ogni altro solo il testo. */
function cleanInline(line: string, links: ReadonlyMap<string, string>): string {
  return line
    .replace(IMAGE, "")
    .replace(INLINE_LINK, (_match, text: string, target: string) => {
      const pageId = links.get(PAGE_LINK.exec(target)?.[1] ?? "");
      const label = text.trim();
      return pageId && label ? `[${label}](page:${pageId})` : label;
    })
    .replace(BARE_URL, "")
    .replace(/`+/g, "")
    .replace(/~~/g, "");
}

/** Riga pulita: null se si toglie del tutto (titolo di livello 1 o 2, separatore, definizione di un link). */
function cleanLine(line: string, links: ReadonlyMap<string, string>): string | null {
  const unquoted = line.replace(QUOTE, "");
  if (RULE.test(unquoted) || LINK_DEFINITION.test(unquoted)) return null;
  const heading = HEADING.exec(unquoted);
  if (heading) {
    // H1 e H2 si tolgono (il titolo del blocco è già nell'articolo); H3 e livelli più bassi diventano H3.
    const text = cleanInline(unquoted.slice(heading[0].length).trim().replace(CLOSING_HASHES, ""), links).trim();
    return heading[1].length <= 2 || !text ? null : `### ${text}`;
  }
  const bullet = BULLET.exec(unquoted);
  const indent = bullet || ORDERED.test(unquoted) ? (/^\s*/.exec(unquoted)?.[0] ?? "") : "";
  const body = cleanInline(bullet ? unquoted.replace(BULLET, "- ") : unquoted.trimStart(), links)
    .replace(/[ \t]+/g, " ")
    .trim();
  if (bullet && !/[\p{L}\p{N}]/u.test(body.slice(2))) return null;
  return body ? `${indent}${body}` : "";
}

/**
 * Markdown semplice del blocco (T-4201): tiene paragrafi, grassetto, corsivo, elenchi, H3 e i link [testo](page:<id>) il
 * cui id è una chiave di links, salvati con l'id della pagina del piano che vi corrisponde; toglie HTML (script e stili
 * con il contenuto), titoli di livello 1 e 2, immagini, tabelle, blocchi di codice, citazioni e ogni altro link
 * lasciandone il testo, più gli indirizzi web scritti nel testo. Un blocco senza testo dopo la pulizia →
 * AI_INVALID_RESPONSE, e il motore prova il modello successivo.
 */
export function sanitizeSectionMarkdown(markdown: string, links: ReadonlyMap<string, string>): string {
  const text = stripHtml(unwrapFence(markdown.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(FORMAT, "")));
  const lines = dropCodeAndTables(text.split("\n"))
    .map((line) => cleanLine(line, links))
    .filter((line): line is string => line !== null);
  const body = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(body)) throw invalid("vuoto dopo la pulizia");
  return body;
}

/** Parole del testo di un blocco, senza la sintassi del Markdown né la destinazione dei link (tetti e controlli). */
export function markdownWords(markdown: string): string[] {
  return markdown
    .replace(/\]\([^()]*\)/g, " ")
    .replace(/[*_#>[\]`~|]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}
