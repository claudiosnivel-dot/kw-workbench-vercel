import { AiTitlesError } from "@/lib/ai/errors";
import { cleanTitle, firstJsonObject, hasKeywordWords } from "@/lib/ai/titles-response";
import { ARTICLE_WORD_CAPS, PROPOSED_H2 } from "@/lib/articles/lengths";
import {
  linkableRef,
  OUTLINE_MAX_SECONDARY,
  outlineBlockIds,
  type OutlineInput,
  PROPOSED_HEADING_LENGTH,
  proposedBlockId,
  proposesH2,
} from "@/lib/articles/outline-prompt";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

/*
 * Controllo deterministico della scaletta restituita dal modello (T-4102): la risposta si accetta solo se ogni blocco,
 * keyword, link, meta e immagine rispetta le regole; slug, nomi dei file e prompt delle immagini li calcola il codice.
 * Un controllo non superato → AI_INVALID_RESPONSE, e il motore prova il modello successivo (T-3802). Una pagina con meno
 * di 2 H2 riceve da 2 a 4 H2 proposti dal modello (T-6503), solo nell'articolo: gli H2 del piano non cambiano.
 */

/** Oltre questa lunghezza la risposta non si analizza (max_tokens 4000 ne produce molto meno). */
const MAX_CONTENT_LENGTH = 60_000;
const MAX_COVERS = 400;
const MAX_META_TITLE = 60;
const MAX_META_DESCRIPTION = 155;
const MAX_IMAGES = 6;
const MAX_PURPOSE = 200;
const MAX_ALT = 125;
const MAX_SUBJECT = 500;
const MAX_SLUG = 80;

/** Indicazione in fondo a ogni prompt d'immagine: nessun testo nella foto. */
export const NO_TEXT_IN_IMAGE = "no text, letters or logos in the image";

export type OutlineBlock = {
  position: number;
  kind: "INTRO" | "H2";
  heading: string | null;
  covers: string;
  /** Keyword della pagina assegnate al blocco, nella forma della pagina. */
  keywords: string[];
  words: number;
  /** Id delle pagine del piano da collegare dal blocco. */
  links: string[];
};

export type OutlineImage = {
  /** Posizione del blocco in cui va l'immagine. */
  position: number;
  cover: boolean;
  purpose: string;
  alt: string;
  fileName: string;
  aspectRatio: "16:9" | "4:3";
  prompt: string;
};

export type ArticleOutline = { metaTitle: string; metaDescription: string; slug: string; blocks: OutlineBlock[]; images: OutlineImage[] };

function invalid(reason: string): AiTitlesError {
  return new AiTitlesError("AI_INVALID_RESPONSE", `Scaletta del modello non valida: ${reason}`);
}

const length = (text: string) => Array.from(text).length;

/** Testo non vuoto entro max caratteri dopo la pulizia; altrimenti AI_INVALID_RESPONSE con il nome del campo. */
function requiredText(value: unknown, max: number, field: string): string {
  const text = typeof value === "string" ? cleanTitle(value) : "";
  if (!text || length(text) > max) throw invalid(`${field} vuoto o oltre ${max} caratteri`);
  return text;
}

/** Elenco di stringhe senza doppioni; un campo assente vale un elenco vuoto. */
function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw invalid(`${field} non è un elenco di testi`);
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Caratteri che un titolo proposto non può avere: tag HTML e segni di Markdown (T-6503). */
const MARKUP = /[<>*_`#[\]|]/;
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;

/**
 * Titolo di un H2 proposto (T-6503): testo semplice da 3 a 120 caratteri, senza tag né Markdown, diverso dagli altri
 * proposti e dagli H2 della pagina (confronto sulla forma canonica); il controllo rifiuta, non corregge.
 */
function proposedHeading(value: unknown, taken: Set<string>, language: string): string {
  const heading = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  const size = length(heading);
  if (size < PROPOSED_HEADING_LENGTH.min || size > PROPOSED_HEADING_LENGTH.max) {
    throw invalid(`heading di un H2 nuovo vuoto, sotto ${PROPOSED_HEADING_LENGTH.min} o oltre ${PROPOSED_HEADING_LENGTH.max} caratteri`);
  }
  if (MARKUP.test(heading) || INVISIBLE.test(heading)) throw invalid("heading di un H2 nuovo con tag o Markdown");
  const key = canonicalizeKeyword(heading, language);
  if (taken.has(key)) throw invalid("heading di un H2 nuovo uguale a un altro H2");
  taken.add(key);
  return heading;
}

/**
 * Id dei blocchi attesi per una risposta con count blocchi: INTRO e un blocco per H2 della pagina, più, se la pagina ha
 * meno di 2 H2, da 2 a 4 blocchi NEW_n; un numero diverso è una risposta non valida.
 */
function expectedBlockIds(count: number, h2Count: number): string[] {
  const ids = outlineBlockIds(h2Count);
  if (!proposesH2(h2Count)) {
    if (count !== ids.length) throw invalid(`servono ${ids.length} blocchi, INTRO e uno per H2`);
    return ids;
  }
  const proposed = count - ids.length;
  if (proposed < PROPOSED_H2.min || proposed > PROPOSED_H2.max) {
    throw invalid(`servono INTRO, un blocco per H2 e da ${PROPOSED_H2.min} a ${PROPOSED_H2.max} H2 nuovi`);
  }
  return [...ids, ...Array.from({ length: proposed }, (_, index) => proposedBlockId(index))];
}

/** Slug della keyword principale: minuscolo, senza accenti latini, parole unite da trattini, al massimo 80 caratteri. */
export function articleSlug(keyword: string, language: string): string {
  const slug = canonicalizeKeyword(keyword, language)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (length(slug) <= MAX_SLUG) return slug;
  const cut = Array.from(slug).slice(0, MAX_SLUG).join("");
  return cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut;
}

/** Keyword della pagina inviate al modello, per forma canonica: la principale e le prime 30 secondarie. */
function pageKeywords(input: OutlineInput): { main: string; byCanonical: Map<string, string> } {
  const { page, language } = input.plan;
  const byCanonical = new Map<string, string>();
  for (const keyword of [page.main, ...page.secondary.slice(0, OUTLINE_MAX_SECONDARY)]) {
    byCanonical.set(canonicalizeKeyword(keyword.keyword, language), keyword.keyword);
  }
  return { main: page.main.keyword, byCanonical };
}

function parseBlocks(value: unknown, input: OutlineInput): { ids: string[]; blocks: OutlineBlock[] } {
  if (!Array.isArray(value)) throw invalid("blocks non è un elenco");
  const { h2, language } = input.plan;
  const ids = expectedBlockIds(value.length, h2.length);
  const headings = new Set(h2.map((heading) => canonicalizeKeyword(heading, language)));
  const { main, byCanonical } = pageKeywords(input);
  const refs = new Map(input.plan.linkable.map((page, index) => [linkableRef(index), page.pageId]));
  const usedSecondary = new Set<string>();

  const blocks = value.map((item, position): OutlineBlock => {
    const block = asRecord(item);
    if (!block || block.id !== ids[position]) throw invalid(`il blocco ${position + 1} non è ${ids[position]}`);
    const keywords = stringList(block.keywords, "keywords").map((text) => {
      const keyword = byCanonical.get(canonicalizeKeyword(text, input.plan.language));
      if (!keyword) throw invalid("keyword che non è della pagina");
      if (keyword !== main) {
        if (usedSecondary.has(keyword)) throw invalid("keyword secondaria in più blocchi");
        usedSecondary.add(keyword);
      }
      return keyword;
    });
    const links = stringList(block.links, "links").map((ref) => {
      const pageId = refs.get(ref);
      if (!pageId) throw invalid("link verso una pagina non collegabile");
      return pageId;
    });
    if (typeof block.words !== "number" || !Number.isInteger(block.words) || block.words < 1) throw invalid("words non è un intero positivo");
    const heading = position === 0 ? null : position <= h2.length ? h2[position - 1] : proposedHeading(block.heading, headings, language);
    return {
      position,
      kind: position === 0 ? "INTRO" : "H2",
      heading,
      covers: requiredText(block.covers, MAX_COVERS, "covers"),
      keywords: [...new Set(keywords)],
      words: block.words,
      links,
    };
  });
  return { ids, blocks };
}

/** Pagine da collegare per forza (T-4102), anche per i controlli (T-4302): per uno spoke la pilastro, per una pilastro ogni spoke. */
export function requiredLinkPages(plan: OutlineInput["plan"]): string[] {
  return plan.linkable.filter((page) => (plan.page.kind === "HUB" ? page.role === "spoke" : page.role === "pillar")).map((page) => page.pageId);
}

/** Link obbligatori (T-4102): uno spoke collega la sua pilastro, una pilastro ognuno dei suoi spoke. */
function checkRequiredLinks(blocks: OutlineBlock[], input: OutlineInput): void {
  const linked = new Set(blocks.flatMap((block) => block.links));
  if (requiredLinkPages(input.plan).some((pageId) => !linked.has(pageId))) {
    throw invalid(input.plan.page.kind === "HUB" ? "manca il link a uno spoke" : "manca il link alla pagina pilastro");
  }
}

/** Prompt in inglese per un generatore: il soggetto del modello, la foto realistica, il formato e nessun testo. */
function imagePrompt(subject: string, aspectRatio: OutlineImage["aspectRatio"]): string {
  return `${subject.replace(/[\s.]+$/, "")}. Realistic photographic style, ${aspectRatio} aspect ratio, ${NO_TEXT_IN_IMAGE}.`;
}

function parseImages(value: unknown, blockIds: string[], slug: string): OutlineImage[] {
  if (!Array.isArray(value) || value.length === 0) throw invalid("serve almeno un'immagine");
  const positions = new Map(blockIds.map((id, index) => [id, index]));
  return value.slice(0, MAX_IMAGES).map((item, index) => {
    const image = asRecord(item);
    const position = typeof image?.block === "string" ? positions.get(image.block.trim()) : undefined;
    if (!image || position === undefined) throw invalid("immagine senza un blocco della scaletta");
    const cover = index === 0;
    const aspectRatio = cover ? "16:9" : "4:3";
    return {
      position,
      cover,
      purpose: requiredText(image.purpose, MAX_PURPOSE, "purpose"),
      alt: requiredText(image.alt, MAX_ALT, "alt"),
      fileName: cover ? `${slug}.webp` : `${slug}-${index + 1}.webp`,
      aspectRatio,
      prompt: imagePrompt(requiredText(image.subject, MAX_SUBJECT, "subject"), aspectRatio),
    };
  });
}

/**
 * Scaletta del modello per l'articolo (T-4102): un blocco INTRO e uno per H2 nell'ordine del piano, ognuno con cosa
 * trattare entro 400 caratteri, solo keyword della pagina (ogni secondaria in un solo blocco), un tetto di parole e
 * link solo verso le pagine collegabili; la somma dei tetti entro quello dell'articolo; il link alla pilastro per uno
 * spoke e a ogni spoke per una pilastro; meta title entro 60 e meta description entro 155 caratteri, entrambe con la
 * keyword principale; da 1 a 6 immagini (oltre la sesta si tengono le prime sei), la prima è la copertina 16:9 e le
 * altre 4:3, con nome del file .webp dallo slug e il prompt in inglese senza testo nell'immagine. Con meno di 2 H2
 * nella pagina servono anche da 2 a 4 blocchi NEW_n con un heading valido, che diventano blocchi H2 dopo quelli della
 * pagina (T-6503); con 2 H2 o più un blocco NEW_n rende la risposta non valida.
 */
export function parseOutlineResponse(content: string, input: OutlineInput): ArticleOutline {
  if (content.length > MAX_CONTENT_LENGTH) throw invalid("testo troppo lungo");
  const value = firstJsonObject(content);
  if (!value) throw invalid("manca un oggetto JSON");

  const { ids, blocks } = parseBlocks(value.blocks, input);
  const maxWords = ARTICLE_WORD_CAPS[input.length];
  if (blocks.reduce((sum, block) => sum + block.words, 0) > maxWords) throw invalid(`la somma dei words supera ${maxWords}`);
  checkRequiredLinks(blocks, input);

  const { language, page } = input.plan;
  const metaTitle = requiredText(value.metaTitle, MAX_META_TITLE, "metaTitle");
  const metaDescription = requiredText(value.metaDescription, MAX_META_DESCRIPTION, "metaDescription");
  if (!hasKeywordWords(metaTitle, page.main.canonical, language) || !hasKeywordWords(metaDescription, page.main.canonical, language)) {
    throw invalid("meta senza la keyword principale");
  }
  const slug = articleSlug(page.main.keyword, language);
  return { metaTitle, metaDescription, slug, blocks, images: parseImages(value.images, ids, slug) };
}
