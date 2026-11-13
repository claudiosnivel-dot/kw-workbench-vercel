// Gate di T-6302 (AC-6302-1…AC-6302-4, D-57): il motore del piano per risultati di Google mette nella stessa pagina le
// keyword con almeno 3 dei primi 10 risultati in comune, forma gli hub per argomento anche da una sola seed, raccoglie i
// luoghi in un'unica pagina locale e lascia i concorrenti tra le non assegnate con il motivo COMPETITOR. In più: lo
// stesso piano per 20 permutazioni, le domande sotto soglia nelle FAQ, le keyword senza risultati e le ancore.
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/modules/strategy/rules";
import { buildSerpPlan } from "@/lib/modules/strategy/serp-cluster";
import type { KeywordClass, PlanPage, StrategyKeywordInput, StrategyPlan, StrategyRules } from "@/lib/modules/strategy/types";
import { MAGNETOTHERAPY_SERP_FIXTURE, serpFixtureInputs } from "../helpers/strategy";

const fixture = serpFixtureInputs();

function planOf(keywords: StrategyKeywordInput[] = fixture.keywords, rules: StrategyRules = DEFAULT_RULES): StrategyPlan {
  return buildSerpPlan({ keywords, serps: fixture.serps, classes: fixture.classes, language: "it", rules });
}

const pageWith = (plan: StrategyPlan, canonical: string): PlanPage | undefined =>
  plan.pages.find((page) => page.main === canonical || page.secondary.includes(canonical));
const keywordsOf = (page: PlanPage) => [page.main, ...page.secondary];

const CITIES = MAGNETOTHERAPY_SERP_FIXTURE.keywords
  .filter((keyword) => keyword.class === "place" && keyword.keywordType === "local" && !keyword.keyword.includes("vicino"))
  .map((keyword) => keyword.keyword);
const COMPETITORS = MAGNETOTHERAPY_SERP_FIXTURE.keywords.filter((keyword) => keyword.class === "competitor").map((keyword) => keyword.keyword);

/** Keyword di prova con i primi risultati indicati per nome di sito. */
function serpKeyword(text: string, volume: number, sites: string[]) {
  const input: StrategyKeywordInput = {
    sourceId: null,
    keyword: text,
    canonical: text,
    volume,
    score: 50,
    scoreSource: "metrics",
    searchIntent: "commercial",
    keywordType: "generic",
    isQuestion: false,
    isLocal: false,
  };
  return { input, urls: sites.map((site) => `https://www.${site}.example/`) };
}

function planFor(items: ReturnType<typeof serpKeyword>[], options: { classes?: [string, KeywordClass][]; anchors?: Parameters<typeof buildSerpPlan>[0]["anchors"] } = {}) {
  return buildSerpPlan({
    keywords: items.map((item) => item.input),
    serps: new Map(items.filter((item) => item.urls.length > 0).map((item) => [item.input.canonical, item.urls])),
    classes: new Map(options.classes ?? []),
    language: "it",
    rules: DEFAULT_RULES,
    anchors: options.anchors,
  });
}

describe("buildSerpPlan", () => {
  // covers: AC-6302-1
  it("con la fixture a una seed: un hub, una pagina per intento, i luoghi in un'unica pagina locale e i concorrenti fuori", () => {
    expect(CITIES).toHaveLength(20);
    const plan = planOf();

    const hubs = plan.pages.filter((page) => page.kind === "HUB");
    expect(hubs.map((page) => page.main)).toEqual(["noleggio magnetoterapia"]);
    expect(hubs[0].reason).toMatchObject({ code: "HUB_SERP" });
    expect(plan.pages.filter((page) => page.kind === "SPOKE").every((page) => page.hubRef === hubs[0].ref)).toBe(true);

    const costs = pageWith(plan, "noleggio magnetoterapia costo")!;
    expect(keywordsOf(costs)).toEqual(expect.arrayContaining(["noleggio magnetoterapia prezzi", "noleggio magnetoterapia quanto costa"]));
    expect(costs.reason).toEqual({ code: "SPOKE_SERP", params: { count: 3, faq: 0 } });
    const tax = pageWith(plan, "noleggio magnetoterapia detraibile")!;
    expect(keywordsOf(tax)).toContain("noleggio magnetoterapia 730");
    expect(tax.ref).not.toBe(costs.ref);

    const local = plan.pages.filter((page) => page.contentType === "local");
    expect(local).toHaveLength(1);
    expect(keywordsOf(local[0])).toEqual(expect.arrayContaining([...CITIES, "noleggio magnetoterapia vicino a me"]));
    expect(local[0].reason).toEqual({ code: "SPOKE_LOCAL", params: { count: 21, faq: 0 } });
    expect(plan.pages.some((page) => CITIES.includes(page.main))).toBe(false);

    expect(plan.unassigned).toEqual(expect.arrayContaining(COMPETITORS));
    expect(COMPETITORS.map((competitor) => plan.unassignedReasons?.[competitor])).toEqual(["COMPETITOR", "COMPETITOR"]);
    expect(plan.pages.some((page) => keywordsOf(page).some((canonical) => COMPETITORS.includes(canonical)))).toBe(false);

    // Domanda sotto i 200: nelle FAQ della pagina con più risultati in comune; keyword senza risultati nella pilastro.
    expect(pageWith(plan, "quante sedute di magnetoterapia")?.main).toBe("magnetoterapia per artrosi");
    expect(pageWith(plan, "come funziona la magnetoterapia")).toMatchObject({ contentType: "faq", reason: { code: "SPOKE_QUESTION" } });
    expect(pageWith(plan, "noleggio magnetoterapia mensile")?.ref).toBe(hubs[0].ref);
    const all = plan.pages.flatMap(keywordsOf);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length + plan.unassigned.length).toBe(fixture.keywords.length);
  });

  // covers: AC-6302-2
  it("con le keyword in ordine inverso, e in 20 permutazioni, il piano è identico", () => {
    const expected = planOf();
    expect(planOf([...fixture.keywords].reverse())).toEqual(expected);

    let state = 7;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    for (let round = 0; round < 20; round += 1) {
      const shuffled = [...fixture.keywords].sort(() => random() - 0.5);
      expect(planOf(shuffled)).toEqual(expected);
    }
  });

  // covers: AC-6302-3
  it("due gruppi senza risultati né parole di contenuto in comune danno due hub", () => {
    const plan = planFor([
      serpKeyword("scarpe running", 1000, ["corsa-a", "corsa-b", "corsa-c", "corsa-d"]),
      serpKeyword("scarpe running offerte", 200, ["offerte-a", "offerte-b", "corsa-a", "offerte-c"]),
      serpKeyword("zaino trekking", 800, ["monti-a", "monti-b", "monti-c", "monti-d"]),
      serpKeyword("zaino trekking 40 litri", 150, ["litri-a", "litri-b", "litri-c", "monti-a"]),
    ]);

    expect(plan.pages.filter((page) => page.kind === "HUB").map((page) => page.main)).toEqual(["scarpe running", "zaino trekking"]);
    expect(pageWith(plan, "scarpe running offerte")).toMatchObject({ kind: "SPOKE", contentType: "product_category" });
  });

  // covers: AC-6302-4
  it("con serpPageOverlap 10 costi e prezzi non sono più nella stessa pagina", () => {
    const plan = planOf(fixture.keywords, { ...DEFAULT_RULES, serpPageOverlap: 10 });

    expect(pageWith(plan, "noleggio magnetoterapia costo")!.ref).not.toBe(pageWith(plan, "noleggio magnetoterapia prezzi")!.ref);
  });

  it("uno spoke sotto soglia confluisce nella pagina con più risultati in comune; con le ancore le pagine nuove sono spoke dell'ancora", () => {
    const items = [
      serpKeyword("scarpe running", 1000, ["corsa-a", "corsa-b", "corsa-c", "corsa-d"]),
      serpKeyword("scarpe running donna", 300, ["donna-a", "donna-b", "donna-c", "corsa-a"]),
      serpKeyword("scarpe running donna nere", 20, ["nere-a", "donna-a", "donna-b", "nere-b"]),
      serpKeyword("scarpe running roma", 40, ["roma-a", "corsa-b"]),
    ];
    const plan = planFor(items, { classes: [["scarpe running roma", "place"]] });

    expect(pageWith(plan, "scarpe running donna nere")?.main).toBe("scarpe running donna");
    // La pagina locale con una sola keyword e 40 ricerche è sotto soglia: confluisce nella pilastro, che ha un URL in comune.
    expect(pageWith(plan, "scarpe running roma")).toMatchObject({ kind: "HUB", reason: { code: "HUB_SERP", params: { merged: 1 } } });

    const anchoredPlan = planFor(items.slice(1), { anchors: [{ ref: "page-1", main: "scarpe running", open: true }] });
    expect(anchoredPlan.pages.map((page) => [page.kind, page.hubRef, page.main])).toEqual([["SPOKE", "page-1", "scarpe running donna"]]);
    expect(anchoredPlan.anchored).toEqual([{ ref: "page-1", secondary: ["scarpe running roma"] }]);
  });
});
