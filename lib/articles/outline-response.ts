import { AiTitlesError } from "@/lib/ai/errors";
import { cleanTitle, firstJsonObject, hasKeywordWords } from "@/lib/ai/titles-response";
import { ARTICLE_WORD_CAPS } from "@/lib/articles/lengths";
import { linkableRef, OUTLINE_MAX_SECONDARY, outlineBlockIds, type OutlineInput } from "@/lib/articles/outline-prompt";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

/*
 * Controllo deterministico della scaletta restituita dal modello (T-4102): la risposta si accetta solo se ogni blocco,
 * keyword, link, meta e immagine rispetta le regole; slug, nomi dei file e prompt delle immagini li calcola il codice.
 * Un controllo non superato → AI_INVALID_RESPONSE, e il motore prova il modello successivo (T-3802).
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

/** Slug della keyword principale: minuscolo, senza accenti latini, parole unite da trattini, al massimo 80 caratteri. */
function articleSlug(keyword: string, language: string): string {
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

function parseBlocks(value: unknown, input: OutlineInput): OutlineBlock[] {
  const ids = outlineBlockIds(input.plan.h2.length);
  if (!Array.isArray(value) || value.length !== ids.length) throw invalid(`servono ${ids.length} blocchi, INTRO e uno per H2`);
  const { main, byCanonical } = pageKeywords(input);
  const refs = new Map(input.plan.linkable.map((page, index) => [linkableRef(index), page.pageId]));
  const usedSecondary = new Set<string>();

  return value.map((item, position) => {
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
    return {
      position,
      kind: position === 0 ? "INTRO" : "H2",
      heading: position === 0 ? null : input.plan.h2[position - 1],
      covers: requiredText(block.covers, MAX_COVERS, "covers"),
      keywords: [...new Set(keywords)],
      words: block.words,
      links,
    };
  });
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
 * altre 4:3, con nome del file .webp dallo slug e il prompt in inglese senza testo nell'immagine.
 */
export function parseOutlineResponse(content: string, input: OutlineInput): ArticleOutline {
  if (content.length > MAX_CONTENT_LENGTH) throw invalid("testo troppo lungo");
  const value = firstJsonObject(content);
  if (!value) throw invalid("manca un oggetto JSON");

  const blocks = parseBlocks(value.blocks, input);
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
  return { metaTitle, metaDescription, slug, blocks, images: parseImages(value.images, outlineBlockIds(input.plan.h2.length), slug) };
}
