import { markdownWords } from "@/lib/articles/markdown-sanitizer";

/*
 * Analisi deterministica del testo di un blocco dell'articolo (T-4301, D-46): i tratti tipici dei testi generati
 * (ai_pattern) e i dati che l'autore deve controllare (to_verify), ognuno con la sua posizione nel Markdown del blocco
 * per evidenziarlo nell'editor. Funzione pura: nessun modello né servizio esterno decide il verdetto. Le espressioni
 * regolari non hanno ripetizioni annidate né ripetizioni illimitate affiancate (CWE-1333).
 */

/** Versione dell'elenco delle regole: cambia con le formule o le regole, così i controlli salvati si riconoscono. */
export const STYLE_RULES_VERSION = 1;

export type StyleRule =
  | "phrase"
  | "em_dash"
  | "emoji"
  | "rhetorical_questions"
  | "repeated_openings"
  | "placeholder"
  | "law"
  | "amount"
  | "percentage"
  | "year"
  | "number";

/** Corrispondenza nel testo: start ed end sono indici della stringa analizzata, end escluso. */
export type StyleMatch = { kind: "ai_pattern" | "to_verify"; rule: StyleRule; start: number; end: number };

/** Esito dell'analisi: le corrispondenze in ordine, le parole, i tratti AI ogni 300 parole e la soglia superata. */
export type StyleAnalysis = { matches: StyleMatch[]; words: number; score: number; overLimit: boolean };

/** Formule, aperture e chiusure tipiche dei testi generati, per lingua; « … » sta per un tratto della stessa frase. */
const PHRASES: Record<string, readonly string[]> = {
  it: [
    "in conclusione", "per concludere", "in sintesi", "in definitiva", "in questo articolo", "in questa guida",
    "nel mondo di oggi", "nel mondo odierno", "al giorno d'oggi", "nell'era digitale", "è importante sottolineare",
    "è importante notare", "è importante ricordare", "va sottolineato", "vale la pena sottolineare", "scopriamo insieme",
    "vediamo insieme", "esploriamo insieme", "senza ombra di dubbio", "a 360 gradi", "non solo … ma anche",
  ],
  en: [
    "in conclusion", "to sum up", "in summary", "in this article", "in this guide", "in today's world",
    "in today's fast-paced world", "in the digital age", "it is important to note", "it's important to note",
    "it is worth noting", "it's worth noting", "let's dive", "dive into", "delve into", "unlock", "unleash",
    "game-changer", "game changer", "a testament to", "navigate the complexities", "not only … but also",
  ],
  es: [
    "en conclusión", "en resumen", "para concluir", "en este artículo", "en esta guía", "en el mundo actual",
    "en la era digital", "hoy en día", "es importante destacar", "es importante señalar", "cabe destacar",
    "cabe señalar", "sumérgete", "descubre", "sin lugar a dudas", "no solo … sino también",
  ],
};

/** Ripetizioni oltre le quali un'apertura o una domanda diventa un tratto: più di 2 frasi di fila. */
const MIN_RUN = 3;
/** Soglia dei tratti AI: almeno 2 ogni 300 parole, mai meno di 2. */
const LIMIT_PATTERNS = 2;
const LIMIT_WORDS = 300;

const NOT_WORD_BEFORE = "(?<![\\p{L}\\p{N}])";
const NOT_WORD_AFTER = "(?![\\p{L}\\p{N}])";
/** Una cifra o un numero con punti e virgole interni, che non comincia dentro un altro numero o una parola. */
const NUMBER_START = "(?<![\\p{L}\\p{N}.,])";
const NUMBER = "\\d(?:[\\d.,]*\\d)?";
/** Spazio facoltativo tra la cifra e il simbolo, anche non separabile. */
const GAP = "[ \\t\\u00A0\\u202F]?";
/** Simbolo o sigla della valuta: la sigla è una parola a sé, anche subito dopo la cifra. */
const CURRENCY = "(?:€|(?<!\\p{L})(?:eur|usd)(?!\\p{L}))";
const LAW_WORDS = [
  "decreto legislativo", "decreto", "legge", "d\\.[ \\t]?lgs\\.?", "d\\.p\\.r\\.", "articolo", "art\\.", "real decreto",
  "ley", "artículo", "regulation", "directive", "section", "article", "law", "act",
].join("|");

const EM_DASH = /—/g;
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu;

/** Regole to_verify in ordine di priorità: un dato già trovato da una regola non si conta di nuovo con una successiva. */
const TO_VERIFY: { rule: StyleRule; pattern: RegExp; minLength?: number }[] = [
  {
    rule: "placeholder",
    pattern: /\[(?:da verificare|por verificar|to verify)[ \t]?:[^[\]\n]{0,300}\]|\[(?:fonte da aggiungere|fuente por añadir|source to add)\]/giu,
  },
  {
    rule: "law",
    pattern: new RegExp(`${NOT_WORD_BEFORE}(?:${LAW_WORDS})[ \\t]{0,2}(?:(?:n|nr|no|núm)\\.[ \\t]{0,2}|n[º°][ \\t]{0,2})?\\d+(?:\\/\\d+)?`, "giu"),
  },
  {
    rule: "amount",
    pattern: new RegExp(`${CURRENCY}${GAP}${NUMBER}|${NUMBER_START}${NUMBER}${GAP}${CURRENCY}`, "giu"),
  },
  { rule: "percentage", pattern: new RegExp(`${NUMBER_START}${NUMBER}${GAP}(?:%|(?:per[ \\t]?cento|percent|por[ \\t]ciento)(?!\\p{L}))`, "giu") },
  { rule: "year", pattern: new RegExp(`${NUMBER_START}(?:1[89]|20)\\d{2}(?!\\p{N}|[.,]\\d)`, "gu") },
  { rule: "number", pattern: new RegExp(`${NUMBER_START}${NUMBER}`, "gu"), minLength: 3 },
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Espressione di una formula: parole separate da spazi, apostrofo dritto o tipografico, « … » dentro la stessa frase. */
function phrasePattern(phrase: string): string {
  return phrase
    .split(" … ")
    .map((part) =>
      part
        .split(" ")
        .map((word) => escapeRegExp(word).replace(/'/g, "['’]"))
        .join(String.raw`\s+`)
    )
    .join(`${NOT_WORD_AFTER}[^.!?\\n]{1,200}?${NOT_WORD_BEFORE}`);
}

const phraseRegExps = new Map<string, RegExp | null>();

/** Le formule della lingua in un'unica espressione, dalla più lunga: due formule non si sovrappongono mai. */
function phraseRegExp(language: string): RegExp | null {
  if (!phraseRegExps.has(language)) {
    const phrases = PHRASES[language];
    const alternatives = phrases ? [...phrases].sort((a, b) => b.length - a.length).map(phrasePattern) : [];
    phraseRegExps.set(language, alternatives.length > 0 ? new RegExp(`${NOT_WORD_BEFORE}(?:${alternatives.join("|")})${NOT_WORD_AFTER}`, "giu") : null);
  }
  return phraseRegExps.get(language) ?? null;
}

function matchesOf(text: string, pattern: RegExp, kind: StyleMatch["kind"], rule: StyleRule): StyleMatch[] {
  return [...text.matchAll(pattern)].map((match) => ({ kind, rule, start: match.index, end: match.index + match[0].length }));
}

type Sentence = { start: number; end: number; first: string | null; question: boolean };

const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(["*", "_", ")", "]", "»", '"', "”", "'", "’"]);
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

function sentence(text: string, start: number, end: number): Sentence | null {
  const content = text.slice(start, end).trimEnd();
  const first = /[\p{L}\p{N}]+/u.exec(content)?.[0];
  if (!first) return null;
  return { start, end: start + content.length, first: first.toLowerCase(), question: /\?[*_)\]»"”'’]*$/.test(content) };
}

/** Frasi del testo in un solo passaggio: finiscono con . ! ? … seguiti da uno spazio (anche dopo ** o virgolette) o a capo. */
function sentences(text: string): Sentence[] {
  const result: Sentence[] = [];
  let start = -1;
  let index = 0;
  const close = (end: number) => {
    const item = start === -1 ? null : sentence(text, start, end);
    if (item) result.push(item);
    start = -1;
  };
  while (index < text.length) {
    const char = text[index];
    if (char === "\n") {
      close(index);
    } else if (start === -1 && !isSpace(char)) {
      start = index;
    } else if (start !== -1 && TERMINATORS.has(char)) {
      let end = index;
      while (TERMINATORS.has(text[end])) end += 1;
      while (CLOSERS.has(text[end])) end += 1;
      if (isSpace(text[end])) {
        close(end);
        index = end;
        continue;
      }
      index = end - 1;
    }
    index += 1;
  }
  close(text.length);
  return result;
}

/** Più di 2 frasi di fila con la stessa chiave non nulla: un tratto dall'inizio della prima alla fine dell'ultima. */
function runs(list: Sentence[], key: (item: Sentence) => string | null, rule: StyleRule): StyleMatch[] {
  const found: StyleMatch[] = [];
  let first = 0;
  for (let index = 1; index <= list.length; index += 1) {
    const current = key(list[first]);
    if (index < list.length && current !== null && key(list[index]) === current) continue;
    if (current !== null && index - first >= MIN_RUN) {
      found.push({ kind: "ai_pattern", rule, start: list[first].start, end: list[index - 1].end });
    }
    first = index;
  }
  return found;
}

/** Dati da verificare, regola per regola nell'ordine di priorità, senza contare due volte lo stesso tratto di testo. */
function toVerify(text: string): StyleMatch[] {
  const covered = new Uint8Array(text.length);
  const found: StyleMatch[] = [];
  for (const { rule, pattern, minLength = 0 } of TO_VERIFY) {
    for (const match of matchesOf(text, pattern, "to_verify", rule)) {
      if (match.end - match.start < minLength || covered.subarray(match.start, match.end).includes(1)) continue;
      covered.fill(1, match.start, match.end);
      found.push(match);
    }
  }
  return found;
}

/**
 * Tratti AI e dati da verificare nel Markdown di un blocco (T-4301). ai_pattern: le formule della lingua per it, en ed
 * es, e per ogni lingua i trattini lunghi, le emoji, più di 2 domande retoriche di fila e più di 2 frasi di fila che
 * iniziano con la stessa parola. to_verify: i segnaposto delle tre lingue di T-4201, gli importi con €, EUR o USD, le
 * percentuali, i riferimenti normativi con il numero, gli anni e le cifre di 3 o più caratteri. score sono i tratti AI
 * ogni 300 parole; overLimit è la soglia superata, almeno 2 tratti ogni 300 parole e mai meno di 2. I dati da verificare
 * non contano per la soglia.
 */
export function analyzeStyle(markdown: string, language: string): StyleAnalysis {
  const phrases = phraseRegExp(language);
  const list = sentences(markdown);
  const aiPatterns = [
    ...(phrases ? matchesOf(markdown, phrases, "ai_pattern", "phrase") : []),
    ...matchesOf(markdown, EM_DASH, "ai_pattern", "em_dash"),
    ...matchesOf(markdown, EMOJI, "ai_pattern", "emoji"),
    ...runs(list, (item) => (item.question ? "?" : null), "rhetorical_questions"),
    ...runs(list, (item) => item.first, "repeated_openings"),
  ];
  const words = markdownWords(markdown).length;
  const matches = [...aiPatterns, ...toVerify(markdown)].sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    matches,
    words,
    score: Math.round((aiPatterns.length * LIMIT_WORDS * 100) / Math.max(words, 1)) / 100,
    overLimit: aiPatterns.length >= Math.max(LIMIT_PATTERNS, (LIMIT_PATTERNS * words) / LIMIT_WORDS),
  };
}
