import { LATIN_AMERICA_COUNTRIES } from "@/lib/i18n/locale";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { keywordWords, variantKey } from "@/lib/modules/strategy/cluster";
import type { PlanPage, StrategyContentType, StrategyPageKind, StrategyPlan } from "@/lib/modules/strategy/types";

/*
 * H1 e H2 suggeriti a modelli fissi (T-1902, D-33): gratuiti, deterministici e non validati sui contenuti dei
 * competitor. I modelli stanno nei cataloghi (strategy.templates) nella lingua dei titoli, che è quella del perimetro,
 * non quella dell'interfaccia; per lo spagnolo il catalogo è quello della variante del paese (T-5101). Funzione pura: il
 * traduttore arriva dal chiamante.
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

/** Lingue con i modelli (spagnolo da T-5101): per le altre H1 e H2 sono le keyword con l'iniziale maiuscola. */
export const TITLE_LANGUAGES = ["it", "en", "es"] as const;

/**
 * Catalogo dei modelli dei titoli (T-5101, D-47): per lo spagnolo quello della variante del paese della strategia,
 * es-419 per un paese ispanofono d'America Latina, es-ES per la Spagna e per ogni altro paese; per le altre lingue il
 * catalogo della lingua.
 */
export function titleCatalogLocale(language: string, country: string | null): string {
  if (language !== "es") return language;
  return country && LATIN_AMERICA_COUNTRIES.includes(country.toUpperCase()) ? "es-419" : "es-ES";
}

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

/** Massimo di H2 per tipo di pagina, chiusure comprese (T-1902; pilastro fino a 20, T-2104); anche per l'AI (T-3502). */
export const MAX_H2: Record<StrategyPageKind, number> = { HUB: 20, SPOKE: 12 };
export const MAX_TITLE_LENGTH = 200;

function capitalize(text: string): string {
  const [first = "", ...rest] = Array.from(text.trim());
  return first.toLocaleUpperCase() + rest.join("");
}

/** Titolo di una keyword-domanda: con «?» in fondo e, in spagnolo, «¿» all'inizio (T-5101), mai raddoppiati. */
function asQuestion(text: string, language: string): string {
  if (language === "es") {
    return `¿${capitalize(text.trim().replace(/^¿+/, "").replace(/\?+$/, ""))}?`;
  }
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
    return clip(asQuestion(main.keyword, context.language));
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
  const heading = (keyword: TitleKeyword) =>
    clip(templated && keyword.isQuestion ? asQuestion(keyword.keyword, context.language) : capitalize(keyword.keyword));

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
  return [...entries.slice(0, MAX_H2[page.kind] - closings.length), ...closings];
}

/** Pagina del piano del motore (T-1901) da titolare: per la pilastro anche le principali dei suoi spoke. */
export function planTitlePage(plan: StrategyPlan, page: PlanPage, keywordOf: (canonical: string) => TitleKeyword): TitlePage {
  return {
    kind: page.kind,
    contentType: page.contentType,
    main: keywordOf(page.main),
    secondary: page.secondary.map(keywordOf),
    spokeMains: page.kind === "HUB" ? plan.pages.filter((spoke) => spoke.hubRef === page.ref).map((spoke) => keywordOf(spoke.main)) : undefined,
  };
}

/** H1 e H2 suggeriti per una pagina del piano (T-1902): stessa pagina, stessi titoli. */
export function buildPageTitles(page: TitlePage, context: TitleContext): { h1: string; h2: string[] } {
  return { h1: h1Of(page, context), h2: h2Of(page, context) };
}
