// Gate di T-5101 (AC-5101-1, AC-5101-2): piano hub & spoke in spagnolo con le parole vuote e i modificatori spagnoli,
// domande con «¿…?» e modelli dei titoli dal catalogo del paese della strategia (es-ES per ES, es-419 per AR).
import { describe, expect, it } from "vitest";
import { classifyKeyword } from "@/lib/modules/classification";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { buildStrategyPlan } from "@/lib/modules/strategy/cluster";
import { DEFAULT_RULES } from "@/lib/modules/strategy/rules";
import { buildPageTitles, planTitlePage, TEMPLATE_VARIANTS, titleCatalogLocale } from "@/lib/modules/strategy/titles";
import { strategyTranslator } from "@/lib/modules/strategy/translator";
import type { PlanPage, StrategyKeywordInput, StrategyPlan } from "@/lib/modules/strategy/types";
import es419 from "@/messages/es-419.json";
import esES from "@/messages/es-ES.json";

type Catalog = { [key: string]: string | Catalog };

const YEAR = 2026;
const SEED = "cama de hospital";
const QUESTION = "cuánto cuesta una cama de hospital";

// La domanda supera i 200 di questionSpokeVolume: è uno spoke a sé, con il suo H1.
const KEYWORDS: [string, number][] = [
  [SEED, 2400],
  ["cama de hospital precio", 880],
  ["cama de hospital barata", 390],
  ["cama de hospital eléctrica", 320],
  [QUESTION, 260],
];

/** Keyword come le legge la strategia: forma canonica di T-702 e classificazione spagnola di T-5001. */
function inputOf([keyword, volume]: [string, number], index: number): StrategyKeywordInput {
  const classification = classifyKeyword(keyword, "es");
  return {
    sourceId: `k${index}`,
    keyword,
    canonical: canonicalizeKeyword(keyword, "es"),
    volume,
    score: null,
    scoreSource: "metrics",
    searchIntent: classification.search_intent,
    keywordType: classification.keyword_type,
    isQuestion: classification.is_question,
    isLocal: classification.is_local_intent,
  };
}

const inputs = KEYWORDS.map(inputOf);
const plan: StrategyPlan = buildStrategyPlan({ keywords: inputs, seeds: [SEED], language: "es", rules: DEFAULT_RULES });

/** Titoli di una pagina del piano come li salva la generazione, con il catalogo del paese della strategia. */
function titlesOf(page: PlanPage, country: string, keywords = inputs) {
  const byCanonical = new Map(keywords.map((input) => [input.canonical, input]));
  const keywordOf = (canonical: string) => {
    const input = byCanonical.get(canonical)!;
    return { keyword: input.keyword, canonical, isQuestion: input.isQuestion };
  };
  return buildPageTitles(planTitlePage(plan, page, keywordOf), {
    language: "es",
    year: YEAR,
    translate: strategyTranslator("es", country),
  });
}

function pageOf(keyword: string): PlanPage | undefined {
  const canonical = canonicalizeKeyword(keyword, "es");
  return plan.pages.find((page) => page.main === canonical || page.secondary.includes(canonical));
}

/** Modello del catalogo indicato (es-419 a livelli sopra es-ES), con keyword e anno e l'iniziale maiuscola. */
function filledTemplate(catalog: "es-ES" | "es-419", contentType: string, variant: string, keyword: string): string {
  const templatesOf = (source: Catalog) => ((source.strategy as Catalog | undefined)?.templates as Catalog | undefined)?.[contentType] as Catalog | undefined;
  const own = catalog === "es-419" ? templatesOf(es419 as Catalog)?.[variant] : undefined;
  const template = String(own ?? templatesOf(esES as Catalog)![variant]);
  const text = template.replace("{keyword}", keyword).replace("{year}", String(YEAR));
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

describe("piano hub & spoke in spagnolo", () => {
  // covers: AC-5101-1
  it("ha la pilastro della seed, prezzo ed economica nella stessa pagina e la domanda con «¿…?» nell'H1", () => {
    const pillar = plan.pages.find((page) => page.kind === "HUB");
    const price = pageOf("cama de hospital precio");
    const question = pageOf(QUESTION)!;

    expect(pillar?.main).toBe(canonicalizeKeyword(SEED, "es"));
    expect(price).toBeDefined();
    expect(pageOf("cama de hospital barata")).toBe(price);
    const h1 = titlesOf(question, "MX").h1;
    expect(h1.startsWith("¿Cuánto")).toBe(true);
    expect(h1.endsWith("?")).toBe(true);
    expect(h1).toBe("¿Cuánto cuesta una cama de hospital?");
  });

  // covers: AC-5101-1
  it("una domanda che ha già «¿» e «?» non li raddoppia", () => {
    const marked = inputs.map((input) => (input.canonical === canonicalizeKeyword(QUESTION, "es") ? { ...input, keyword: `¿${QUESTION}?` } : input));

    expect(titlesOf(pageOf(QUESTION)!, "MX", marked).h1).toBe("¿Cuánto cuesta una cama de hospital?");
  });

  // covers: AC-5101-2
  it("la pilastro usa i modelli di es-ES con ES e di es-419 con AR, con la maiuscola solo sulla prima lettera", () => {
    const pillar = plan.pages.find((page) => page.kind === "HUB")!;

    expect(titleCatalogLocale("es", "ES")).toBe("es-ES");
    expect(titleCatalogLocale("es", "AR")).toBe("es-419");
    for (const [country, catalog] of [
      ["ES", "es-ES"],
      ["AR", "es-419"],
    ] as const) {
      const h1 = titlesOf(pillar, country).h1;
      const expected = TEMPLATE_VARIANTS[pillar.contentType].map((variant) => filledTemplate(catalog, pillar.contentType, variant, SEED));

      expect(expected, country).toContain(h1);
      expect(h1.charAt(0)).toBe("C");
      expect(h1.slice(1)).toBe(h1.slice(1).toLocaleLowerCase("es"));
    }
  });
});
