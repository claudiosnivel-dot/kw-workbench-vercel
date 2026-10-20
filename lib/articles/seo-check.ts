import { markdownWords } from "@/lib/articles/markdown-sanitizer";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { keywordWords } from "@/lib/modules/strategy/cluster";
import { isStopword, wordStem } from "@/lib/modules/strategy/modifiers";

/*
 * Controllo SEO deterministico dell'articolo (T-4302, D-46): keyword, densità, link obbligatori e meta secondo i canoni,
 * senza forzature. Funzione pura. Una keyword compare quando il testo ha, una dopo l'altra, le sue parole nella forma
 * canonica di T-702 senza le parole vuote e ridotte alla radice (keywordWords di T-1901): stesse parole in qualunque
 * ordine, singolari e plurali compresi («letti ospedalieri elettrici» e «letto ospedaliero elettrico»).
 */

/** Occorrenze massime della keyword principale ogni 100 parole. */
const MAX_DENSITY = 2.5;
const OPENING_WORDS = 100;
const MAX_META_TITLE = 60;
const MAX_META_DESCRIPTION = 155;

/** Blocco dell'articolo: il suo testo in Markdown, le keyword assegnate dalla scaletta e le pagine da collegare. */
export type SeoBlock = { position: number; body: string; keywords: string[]; links: string[] };

/** Articolo da controllare: keyword principale, H1 e meta, le pagine che vanno collegate per forza e i blocchi. */
export type SeoArticle = {
  language: string;
  mainKeyword: string;
  h1: string;
  metaTitle: string | null;
  metaDescription: string | null;
  requiredLinks: string[];
  blocks: SeoBlock[];
};

export type SeoProblem =
  | { rule: "main_keyword_h1" | "main_keyword_opening" | "main_keyword_meta_title" | "main_keyword_meta_description" }
  | { rule: "meta_title_length" | "meta_description_length"; length: number; max: number }
  /** La keyword principale count volte dove ne bastano al massimo max. */
  | { rule: "density"; count: number; max: number }
  | { rule: "keyword_missing"; keyword: string }
  | { rule: "link_missing"; pageId: string };

/** Problemi dell'articolo e di ogni blocco, con la densità della keyword principale ogni 100 parole. */
export type SeoAnalysis = { density: number; problems: SeoProblem[]; blocks: { position: number; problems: SeoProblem[] }[] };

/** Parole di contenuto del testo: forma canonica di T-702, senza parole vuote, ridotte alla radice. */
function contentStems(text: string, language: string): string[] {
  return canonicalizeKeyword(markdownWords(text).join(" "), language)
    .split(" ")
    .filter((token) => token && !isStopword(token, language))
    .map((token) => wordStem(token, language));
}

/** Occorrenze della keyword: gruppi di parole di contenuto consecutive con le sue stesse radici, senza sovrapporsi. */
function occurrences(stems: string[], keyword: Set<string>): number {
  let count = 0;
  for (let start = 0; keyword.size > 0 && start + keyword.size <= stems.length; ) {
    const window = new Set(stems.slice(start, start + keyword.size));
    if (window.size === keyword.size && [...window].every((stem) => keyword.has(stem))) {
      count += 1;
      start += keyword.size;
    } else {
      start += 1;
    }
  }
  return count;
}

/** Densità oltre il limite: almeno 2 occorrenze e più di 2,5 ogni 100 parole; una sola citazione va sempre bene. */
function densityProblem(count: number, words: number): SeoProblem | null {
  if (count < 2 || (count * 100) / words <= MAX_DENSITY) return null;
  return { rule: "density", count, max: Math.max(1, Math.floor((MAX_DENSITY * words) / 100)) };
}

const length = (text: string | null) => Array.from(text ?? "").length;

/**
 * Controllo SEO dell'articolo (T-4302). Per l'articolo: keyword principale nell'H1, nelle prime 100 parole del testo,
 * nel meta title e nella meta description; meta title fino a 60 e meta description fino a 155 caratteri; densità della
 * keyword principale sul testo di tutti i blocchi. Per ogni blocco: ogni keyword assegnata presente, densità della
 * keyword principale nel blocco e i link obbligatori che la scaletta gli ha assegnato, nella forma [testo](page:<id>).
 */
export function analyzeSeo(article: SeoArticle): SeoAnalysis {
  const { language } = article;
  const keyword = (text: string) => keywordWords(canonicalizeKeyword(text, language), language);
  const main = keyword(article.mainKeyword);
  const has = (text: string | null, stems: Set<string>) => stems.size === 0 || occurrences(contentStems(text ?? "", language), stems) > 0;

  const blocks = [...article.blocks].sort((a, b) => a.position - b.position);
  const required = new Set(article.requiredLinks);
  let totalWords = 0;
  let totalCount = 0;
  const blockProblems = blocks.map((block) => {
    const words = markdownWords(block.body).length;
    const count = occurrences(contentStems(block.body, language), main);
    totalWords += words;
    totalCount += count;
    const problems: SeoProblem[] = [...new Set(block.keywords)]
      .filter((text) => !has(block.body, keyword(text)))
      .map((text) => ({ rule: "keyword_missing", keyword: text }));
    const density = densityProblem(count, words);
    if (density) problems.push(density);
    for (const pageId of new Set(block.links)) {
      if (required.has(pageId) && !block.body.includes(`](page:${pageId})`)) problems.push({ rule: "link_missing", pageId });
    }
    return { position: block.position, problems };
  });

  const opening = markdownWords(blocks.map((block) => block.body).join("\n\n"))
    .slice(0, OPENING_WORDS)
    .join(" ");
  const problems: SeoProblem[] = [];
  if (!has(article.h1, main)) problems.push({ rule: "main_keyword_h1" });
  if (!has(opening, main)) problems.push({ rule: "main_keyword_opening" });
  if (!has(article.metaTitle, main)) problems.push({ rule: "main_keyword_meta_title" });
  if (!has(article.metaDescription, main)) problems.push({ rule: "main_keyword_meta_description" });
  if (length(article.metaTitle) > MAX_META_TITLE) problems.push({ rule: "meta_title_length", length: length(article.metaTitle), max: MAX_META_TITLE });
  if (length(article.metaDescription) > MAX_META_DESCRIPTION) {
    problems.push({ rule: "meta_description_length", length: length(article.metaDescription), max: MAX_META_DESCRIPTION });
  }
  const density = densityProblem(totalCount, totalWords);
  if (density) problems.push(density);

  return { density: totalWords > 0 ? Math.round((totalCount * 10_000) / totalWords) / 100 : 0, problems, blocks: blockProblems };
}
