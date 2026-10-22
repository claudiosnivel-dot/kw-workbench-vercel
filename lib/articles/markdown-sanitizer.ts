import { AiTitlesError } from "@/lib/ai/errors";

/*
 * Pulizia deterministica del testo di un blocco dell'articolo (T-4201, D-46): dal testo del modello resta Markdown
 * semplice, cioè paragrafi, grassetto, corsivo, elenchi, sottotitoli H3, i link interni page: delle pagine del blocco e
 * le tabelle semplici nei limiti (T-5501, D-51). Tutto il resto (HTML, titoli di livello 1 e 2, immagini, tabelle fuori
 * dai limiti, codice, link esterni e indirizzi web) si toglie, lasciando il testo dove ce n'è uno (CWE-79: editor ed
 * export non ricevono HTML dal modello).
 */

/** Elementi che si tolgono con il loro contenuto. */
const RAW_ELEMENTS = /<(script|style|iframe|object|embed|noscript|template|textarea|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
/** A capo dentro una riga: diventa uno spazio, così una cella di tabella con <br> resta sulla sua riga. */
const LINE_BREAK = /<\/?br\b[^<>]*>/gi;
/** Tag di blocco: diventano un a capo, così i paragrafi in HTML restano separati. */
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|blockquote|section|article|hr)\b[^<>]*>/gi;
const ANY_TAG = /<\/?[a-z][^<>]*>|<![^<>]*>|<\?[^<>]*>/gi;
/** Resto di un tag non chiuso: '<' seguito da una lettera, '/', '!' o '?'. */
const TAG_OPENER = /<(?=[a-z/!?])/gi;
/** Caratteri di controllo tranne a capo e tabulazione. */
const CONTROL = /[^\P{Cc}\n\t]/gu;
const FORMAT = /\p{Cf}/gu;

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
/** Riga che sembra di una tabella: comincia e finisce con '|'. Fuori da una tabella nei limiti si toglie. */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** Cella della riga di separazione: trattini con i due punti facoltativi dell'allineamento. */
const DELIMITER_CELL = /^:?-+:?$/;
/** Separatore delle celle: '|' non preceduto dal backslash, che resta nel testo della cella come «\|». */
const CELL_SEPARATOR = /(?<!\\)\|/;
/** Limiti di una tabella (T-5501, CWE-770): da 2 a 5 colonne e da 1 a 12 righe di dati. */
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;
const MAX_ROWS = 12;
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
  return text
    .replace(RAW_ELEMENTS, "")
    .replace(COMMENT, "")
    .replace(LINE_BREAK, " ")
    .replace(BLOCK_TAG, "\n")
    .replace(ANY_TAG, "")
    .replace(TAG_OPENER, "");
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

const cleanCell = (cell: string, links: ReadonlyMap<string, string>) =>
  cleanInline(cell, links)
    .replace(/[ \t]+/g, " ")
    .trim();

/** Riga pulita: null se si toglie del tutto (titolo di livello 1 o 2, separatore, definizione di un link). */
function cleanLine(line: string, links: ReadonlyMap<string, string>): string | null {
  if (RULE.test(line) || LINK_DEFINITION.test(line)) return null;
  const heading = HEADING.exec(line);
  if (heading) {
    // H1 e H2 si tolgono (il titolo del blocco è già nell'articolo); H3 e livelli più bassi diventano H3.
    const text = cleanInline(line.slice(heading[0].length).trim().replace(CLOSING_HASHES, ""), links).trim();
    return heading[1].length <= 2 || !text ? null : `### ${text}`;
  }
  const bullet = BULLET.exec(line);
  const indent = bullet || ORDERED.test(line) ? (/^\s*/.exec(line)?.[0] ?? "") : "";
  const body = cleanCell(bullet ? line.replace(BULLET, "- ") : line.trimStart(), links);
  if (bullet && !/[\p{L}\p{N}]/u.test(body.slice(2))) return null;
  return body ? `${indent}${body}` : "";
}

/** Celle di una riga di tabella: senza il '|' iniziale e quello finale, facoltativi, divise ai '|' senza backslash. */
function tableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(CELL_SEPARATOR).map((cell) => cell.trim());
}

const isDelimiterRow = (line: string | undefined) =>
  line !== undefined && line.includes("|") && tableCells(line).every((cell) => DELIMITER_CELL.test(cell));

const tableRow = (cells: string[]) => `| ${cells.join(" | ")} |`;

/** Cella della riga di separazione con il suo allineamento: ---, :---, ---: o :---:. */
const delimiterCell = (cell: string) => `${cell.startsWith(":") ? ":" : ""}---${cell.endsWith(":") ? ":" : ""}`;

/**
 * Tabella che comincia con l'intestazione in lines[start] (T-5501): le righe con '|' che seguono la riga di separazione,
 * fino alla prima riga vuota o senza '|'. Nei limiti (da 2 a 5 colonne, ogni riga con le celle dell'intestazione, da 1 a
 * 12 righe di dati) e con tables escono le righe pulite cella per cella tra due righe vuote; altrimenti nessuna riga.
 */
function readTable(lines: string[], start: number, links: ReadonlyMap<string, string>, tables: boolean): { end: number; kept: string[] } {
  let end = start + 2;
  while (end < lines.length && lines[end].trim() && lines[end].includes("|")) end += 1;
  const [header, delimiter, ...rows] = lines.slice(start, end).map(tableCells);
  const columns = header.length;
  const fits =
    columns >= MIN_COLUMNS &&
    columns <= MAX_COLUMNS &&
    delimiter.length === columns &&
    rows.length >= 1 &&
    rows.length <= MAX_ROWS &&
    rows.every((row) => row.length === columns);
  if (!tables || !fits) return { end, kept: [] };
  const clean = (row: string[]) => tableRow(row.map((cell) => cleanCell(cell, links)));
  return { end, kept: ["", clean(header), tableRow(delimiter.map(delimiterCell)), ...rows.map(clean), ""] };
}

/**
 * Righe pulite del blocco: senza i blocchi di codice (recinti ``` o ~~~, anche non chiusi), con le sole tabelle nei
 * limiti; una riga di separazione senza intestazione, con le righe con '|' che la seguono, e ogni altra riga che comincia
 * e finisce con '|' si tolgono.
 */
function cleanLines(lines: string[], links: ReadonlyMap<string, string>, tables: boolean): string[] {
  const kept: string[] = [];
  let fence: string | null = null;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (marker) {
      fence = marker;
    } else if (line.includes("|") && !isDelimiterRow(line) && isDelimiterRow(lines[index + 1])) {
      const table = readTable(lines, index, links, tables);
      kept.push(...table.kept);
      index = table.end;
      continue;
    } else if (isDelimiterRow(line)) {
      while (index + 1 < lines.length && lines[index + 1].trim() && lines[index + 1].includes("|")) index += 1;
    } else if (!TABLE_ROW.test(line)) {
      const cleaned = cleanLine(line, links);
      if (cleaned !== null) kept.push(cleaned);
    }
    index += 1;
  }
  return kept;
}

/**
 * Markdown semplice del blocco (T-4201): tiene paragrafi, grassetto, corsivo, elenchi, H3 e i link [testo](page:<id>) il
 * cui id è una chiave di links, salvati con l'id della pagina del piano che vi corrisponde; toglie HTML (script e stili
 * con il contenuto), titoli di livello 1 e 2, immagini, blocchi di codice, citazioni e ogni altro link lasciandone il
 * testo, più gli indirizzi web scritti nel testo. Con tables (il default) tiene anche le tabelle nei limiti con le celle
 * pulite come il testo (T-5501), tra due righe vuote; senza (le risposte delle domande frequenti) le toglie tutte. Un
 * blocco senza testo dopo la pulizia → AI_INVALID_RESPONSE, e il motore prova il modello successivo.
 */
export function sanitizeSectionMarkdown(markdown: string, links: ReadonlyMap<string, string>, { tables = true }: { tables?: boolean } = {}): string {
  const text = stripHtml(unwrapFence(markdown.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(FORMAT, "")));
  const lines = cleanLines(
    text.split("\n").map((line) => line.replace(QUOTE, "")),
    links,
    tables
  );
  const body = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(body)) throw invalid("vuoto dopo la pulizia");
  return body;
}

/** Riga di una tabella del testo pulito (T-5502): nel testo pulito solo le tabelle hanno righe che cominciano e finiscono con '|'. */
export const isTableRow = (line: string) => TABLE_ROW.test(line);

/** Parole del testo di un blocco, senza la sintassi del Markdown né la destinazione dei link (tetti e controlli). */
export function markdownWords(markdown: string): string[] {
  return markdown
    .replace(/\]\([^()]*\)/g, " ")
    .replace(/[*_#>[\]`~|]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}
