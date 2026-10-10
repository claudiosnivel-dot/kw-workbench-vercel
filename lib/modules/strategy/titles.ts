import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { keywordWords, variantKey } from "@/lib/modules/strategy/cluster";
import type { StrategyContentType, StrategyPageKind } from "@/lib/modules/strategy/types";

/*
 * H1 e H2 suggeriti a modelli fissi (T-1902, D-33): gratuiti, deterministici e non validati sui contenuti dei
 * competitor. I modelli stanno nei cataloghi (strategy.templates) nella lingua dei titoli, che è quella del perimetro,
 * non quella dell'interfaccia. Funzione pura: il traduttore arriva dal chiamante.
 */

export type TitleKeyword = { keyword: string; canonical: string; isQuestion: boolean };

/** Pagina da titolare: secondarie in ordine di priorità; per la pilastro anche le principali dei suoi spoke. */
export type TitlePage = {
  kind: StrategyPageKind;
  contentType: StrategyContentType;
  main: TitleKeyword;
  secondary: TitleKeyword[];
  spokeMains?: TitleKeyword[];
};

/** Traduttore del namespace strategy nella lingua dei titoli. */
export type TitleTranslator = (key: string, values?: Record<string, string>) => string;

export type TitleContext = { language: string; year: number; translate: TitleTranslator };

/** Lingue con i modelli: per le altre H1 e H2 sono le keyword con l'iniziale maiuscola. */
export const TITLE_LANGUAGES = ["it", "en"] as const;

/** Varianti dei modelli di H1 per tipo di contenuto (chiavi strategy.templates.<tipo>.<variante>). */
export const TEMPLATE_VARIANTS: Record<StrategyContentType, readonly string[]> = {
  guide: ["v1", "v2", "v3"],
  list: ["v1", "v2"],
  comparison: ["v1", "v2"],
  product_category: ["v1", "v2"],
  faq: ["v1", "v2"],
  local: ["v1", "v2"],
  tool: ["v1", "v2", "v3"],
};

const MAX_H2 = 12;
export const MAX_TITLE_LENGTH = 200;

function capitalize(text: string): string {
  const [first = "", ...rest] = Array.from(text.trim());
  return first.toLocaleUpperCase() + rest.join("");
}

function asQuestion(text: string): string {
  const capitalized = capitalize(text);
  return capitalized.endsWith("?") ? capitalized : `${capitalized}?`;
}

function clip(text: string): string {
  return Array.from(text).slice(0, MAX_TITLE_LENGTH).join("").trim();
}

/** FNV-1a a 32 bit: sceglie la variante in modo stabile dalla keyword principale. */
function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function supportsTemplates(language: string): boolean {
  return (TITLE_LANGUAGES as readonly string[]).includes(language);
}

function h1Of(page: TitlePage, context: TitleContext): string {
  const { main, contentType } = page;
  if (!supportsTemplates(context.language)) {
    return clip(capitalize(main.keyword));
  }
  if (main.isQuestion) {
    return clip(asQuestion(main.keyword));
  }
  // Un modello che contiene già una parola della keyword (guida, migliori, online...) la ripeterebbe: si salta.
  const mainWords = keywordWords(main.canonical, context.language);
  const compatible = TEMPLATE_VARIANTS[contentType].filter((variant) => {
    const text = context.translate(`templates.${contentType}.${variant}`, { keyword: "", year: "" });
    const words = keywordWords(canonicalizeKeyword(text, context.language), context.language);
    return ![...words].some((word) => mainWords.has(word));
  });
  if (compatible.length === 0) {
    return clip(capitalize(main.keyword));
  }
  const variant = compatible[stableHash(main.canonical) % compatible.length];
  return clip(
    capitalize(context.translate(`templates.${contentType}.${variant}`, { keyword: main.keyword, year: String(context.year) }))
  );
}

/** Una keyword per gruppo di varianti, nell'ordine dato, senza il gruppo della principale. */
function groupLeads(page: TitlePage, keywords: TitleKeyword[], language: string): TitleKeyword[] {
  const seen = new Set([variantKey(page.main.canonical, language)]);
  return keywords.filter((keyword) => {
    const key = variantKey(keyword.canonical, language);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function h2Of(page: TitlePage, context: TitleContext): string[] {
  const templated = supportsTemplates(context.language);
  const heading = (keyword: TitleKeyword) => clip(templated && keyword.isQuestion ? asQuestion(keyword.keyword) : capitalize(keyword.keyword));

  // Pilastro: uno per spoke in ordine di priorità, poi i gruppi confluiti; le domande vanno nella FAQ di chiusura.
  // Spoke: uno per gruppo di secondarie, domande comprese.
  const entries =
    page.kind === "HUB"
      ? [
          ...(page.spokeMains ?? []).map(heading),
          ...groupLeads(page, page.secondary.filter((keyword) => !keyword.isQuestion), context.language).map(heading),
        ]
      : groupLeads(page, page.secondary, context.language).map(heading);

  const closings = templated
    ? [
        ...(page.contentType === "list" ? [context.translate("fixedH2.methodology")] : []),
        ...(page.secondary.some((keyword) => keyword.isQuestion) ? [context.translate("fixedH2.faq")] : []),
      ]
    : [];
  return [...entries.slice(0, MAX_H2 - closings.length), ...closings];
}

/** H1 e H2 suggeriti per una pagina del piano (T-1902): stessa pagina, stessi titoli. */
export function buildPageTitles(page: TitlePage, context: TitleContext): { h1: string; h2: string[] } {
  return { h1: h1Of(page, context), h2: h2Of(page, context) };
}
