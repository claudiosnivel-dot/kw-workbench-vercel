// Gate di T-6302 (AC-6302-1…AC-6302-4, D-57): il motore del piano per risultati di Google mette nella stessa pagina le
// keyword con almeno 3 dei primi 10 risultati in comune, forma gli hub per argomento anche da una sola seed, raccoglie i
// luoghi in un'unica pagina locale e lascia i concorrenti tra le non assegnate con il motivo COMPETITOR. In più: lo
// stesso piano per 20 permutazioni, le domande sotto soglia nelle FAQ, le keyword senza risultati e le ancore.
// Gate di T-6502 (AC-6502-1, AC-6502-2, D-60): sui risultati di Google veri di «Noleggio magnetoterapia» la pilastro
// non raccoglie più metà delle keyword; una pagina sotto soglia confluisce in uno spoke con URL in comune, mai nella
// pilastro che ne ha di più con l'unione degli URL delle sue keyword.
// Gate di T-6701 (AC-6701-1, AC-6701-2, D-62): la pagina locale riceve solo luoghi, mai una pagina sciolta. Gate di
// T-6702 (AC-6702-1, AC-6702-2): la keyword principale di ogni pagina sciolta, tranne luoghi, concorrenti e domande nelle
// FAQ, è un angolo da valutare.
import { describe, expect, it } from "vitest";
import { fixedClasses } from "@/lib/modules/plan-ai/classify";
import { DEFAULT_RULES } from "@/lib/modules/strategy/rules";
import { buildSerpPlan } from "@/lib/modules/strategy/serp-cluster";
import type { KeywordClass, PlanPage, StrategyKeywordInput, StrategyPlan, StrategyRules } from "@/lib/modules/strategy/types";
import { fixtureInputs, MAGNETOTHERAPY_REAL_SERP_FIXTURE, MAGNETOTHERAPY_SERP_FIXTURE, serpFixtureInputs } from "../helpers/strategy";

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
function serpKeyword(text: string, volume: number | null, sites: string[], isQuestion = false) {
  const input: StrategyKeywordInput = {
    sourceId: null,
    keyword: text,
    canonical: text,
    volume,
    score: 50,
    scoreSource: "metrics",
    searchIntent: "commercial",
    keywordType: "generic",
    isQuestion,
    isLocal: false,
  };
  return { input, urls: sites.map((site) => `https://www.${site}.example/`) };
}

type PlanOptions = { classes?: [string, KeywordClass][]; anchors?: Parameters<typeof buildSerpPlan>[0]["anchors"]; rules?: Partial<StrategyRules> };

function planFor(items: ReturnType<typeof serpKeyword>[], options: PlanOptions = {}) {
  return buildSerpPlan({
    keywords: items.map((item) => item.input),
    serps: new Map(items.filter((item) => item.urls.length > 0).map((item) => [item.input.canonical, item.urls])),
    classes: new Map(options.classes ?? []),
    language: "it",
    rules: { ...DEFAULT_RULES, ...options.rules },
    anchors: options.anchors,
  });
}

/** Siti numerati: sites("r", 10) = r1…r10. */
const sites = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

const PLACES = ["magnetoterapia roma", "magnetoterapia milano", "magnetoterapia torino"];

/** Perimetro di T-6701: pilastro, uno spoke S di 2 keyword, tre luoghi con 10 URL ciascuno e K con i siti indicati. */
function localPerimeter(kSites: string[]) {
  return [
    serpKeyword("magnetoterapia", 1000, sites("p", 10)),
    serpKeyword("magnetoterapia ginocchio", 300, sites("s", 10)),
    serpKeyword("magnetoterapia ginocchio prezzo", 50, ["s1", "s2", "s3", ...sites("g", 7)]),
    serpKeyword(PLACES[0], 40, sites("r", 10)),
    serpKeyword(PLACES[1], 30, sites("m", 10)),
    serpKeyword(PLACES[2], 20, sites("t", 10)),
    serpKeyword("magnetoterapia spalla", null, kSites),
  ];
}
const placeClasses = (places: string[]): [string, KeywordClass][] => places.map((place) => [place, "place"]);

const ANGLE_PLACES = ["scarpe running roma", "scarpe running milano", "scarpe running torino"];

/**
 * Perimetro di T-6702: pilastro e tre spoke che superano le soglie (donna, uomo, trail) con maxSpokesPerHub 2, una pagina
 * A con volume 10, una pagina B senza volume e una domanda Q sotto questionSpokeVolume; con extra anche tre luoghi con
 * poche ricerche (la pagina locale resta oltre il massimo di spoke) e un concorrente.
 */
function anglePerimeter(extra = false) {
  return [
    serpKeyword("scarpe running", 5000, sites("p", 10)),
    serpKeyword("scarpe running donna", 900, sites("d", 10)),
    serpKeyword("scarpe running donna leggere", 100, ["d1", "d2", "d3", ...sites("dl", 7)]),
    serpKeyword("scarpe running uomo", 600, sites("u", 10)),
    serpKeyword("scarpe running uomo leggere", 80, ["u1", "u2", "u3", ...sites("ul", 7)]),
    serpKeyword("scarpe running trail", 300, ["d9", ...sites("t", 9)]),
    serpKeyword("scarpe running trail fango", 60, ["t1", "t2", "t3", ...sites("tf", 7)]),
    serpKeyword("scarpe running bambino", 10, ["u9", ...sites("a", 9)]),
    serpKeyword("scarpe running pronatore", null, ["d8", ...sites("b", 9)]),
    serpKeyword("come scegliere scarpe running", 50, ["d7", ...sites("q", 9)], true),
    ...(extra
      ? [
          serpKeyword(ANGLE_PLACES[0], 30, ["u8", ...sites("r", 9)]),
          serpKeyword(ANGLE_PLACES[1], 20, ["u7", ...sites("m", 9)]),
          serpKeyword(ANGLE_PLACES[2], 10, ["u6", ...sites("n", 9)]),
          serpKeyword("scarpe running decathlon", 400, sites("c", 10)),
        ]
      : []),
  ];
}
const ANGLE_RULES: Partial<StrategyRules> = { maxSpokesPerHub: 2 };

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

  // covers: AC-6502-2
  it("una pagina sotto soglia confluisce nello spoke con URL in comune, non nella pilastro che ne ha di più con l'unione degli URL", () => {
    const pillar = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];
    const items = [
      serpKeyword("magnetoterapia", 1000, pillar),
      serpKeyword("magnetoterapia ginocchio", 300, ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "p8"]),
      // Secondarie della pilastro (3 URL in comune con la principale): portano x1…x5 nell'unione degli URL della pilastro.
      serpKeyword("magnetoterapia apparecchio", 200, ["p2", "p3", "p4", "x1", "x2", "x3"]),
      serpKeyword("magnetoterapia domicilio", 150, ["p5", "p6", "p7", "x4", "x5", "y1"]),
      // Una keyword e 20 ricerche: sotto soglia. 1 URL in comune con la principale della pilastro, 2 con quella dello
      // spoke, 6 con l'unione degli URL della pilastro.
      serpKeyword("magnetoterapia tendinite", 20, ["p1", "s1", "s2", "x1", "x2", "x3", "x4", "x5", "t1", "t2"]),
    ];
    const plan = planFor(items);

    const hub = plan.pages.find((page) => page.kind === "HUB")!;
    expect(hub.main).toBe("magnetoterapia");
    expect(keywordsOf(hub)).toEqual(expect.arrayContaining(["magnetoterapia apparecchio", "magnetoterapia domicilio"]));
    expect(hub.reason).toMatchObject({ code: "HUB_SERP", params: { merged: 0 } });
    expect(pageWith(plan, "magnetoterapia tendinite")).toMatchObject({ kind: "SPOKE", hubRef: hub.ref, main: "magnetoterapia ginocchio" });
    expect(plan.pages.some((page) => page.main === "magnetoterapia tendinite")).toBe(false);
  });

  // covers: AC-6502-1
  it("sui risultati di Google veri di «Noleggio magnetoterapia» la pilastro ha meno della metà delle keyword e il piano almeno 4 spoke", () => {
    const real = MAGNETOTHERAPY_REAL_SERP_FIXTURE;
    expect(real.keywords).toHaveLength(175);
    expect(real.keywords.flatMap((item) => item.urls).some((url) => url.includes("google.com/goto") || url.includes("srsltid="))).toBe(false);
    const keywords = fixtureInputs(real);
    const serps = new Map(real.keywords.map((item, index) => [keywords[index].canonical, item.urls]));
    // Nessuna classe dall'AI: solo i riconoscimenti fissi, come un piano con la classificazione non riuscita.
    const plan = buildSerpPlan({ keywords, serps, classes: fixedClasses(keywords, serps, "it"), language: "it", rules: DEFAULT_RULES });

    const inPlan = plan.pages.reduce((sum, page) => sum + keywordsOf(page).length, 0);
    const pillars = plan.pages.filter((page) => page.kind === "HUB");
    expect(pillars.length).toBeGreaterThan(0);
    for (const pillar of pillars) expect(keywordsOf(pillar).length).toBeLessThan(inPlan / 2);
    expect(plan.pages.filter((page) => page.kind === "SPOKE").length).toBeGreaterThanOrEqual(4);
    expect(inPlan + plan.unassigned.length).toBe(175);
  });

  // covers: AC-6701-1
  it("una pagina sciolta con più URL in comune con i luoghi confluisce nello spoke con cui ne ha uno, non nella pagina locale", () => {
    const plan = planFor(localPerimeter(["r1", "m1", "t1", "s10", ...sites("k", 6)]), { classes: placeClasses(PLACES) });

    expect(pageWith(plan, "magnetoterapia spalla")).toMatchObject({ kind: "SPOKE", main: "magnetoterapia ginocchio" });
    const local = plan.pages.filter((page) => page.contentType === "local");
    expect(local).toHaveLength(1);
    expect(keywordsOf(local[0]).sort()).toEqual([...PLACES].sort());
  });

  // covers: AC-6701-2
  it("una pagina sciolta senza URL in comune con gli spoke tenuti va nella pilastro, non nella pagina locale", () => {
    const plan = planFor(localPerimeter(["r1", "m1", "t1", ...sites("k", 7)]), { classes: placeClasses(PLACES) });

    expect(pageWith(plan, "magnetoterapia spalla")).toMatchObject({ kind: "HUB", main: "magnetoterapia" });
    const local = plan.pages.filter((page) => page.contentType === "local");
    expect(local).toHaveLength(1);
    expect(keywordsOf(local[0]).sort()).toEqual([...PLACES].sort());
  });

  // covers: AC-6702-1
  it("le keyword principali delle pagine sciolte, per soglia o oltre il massimo di spoke, sono angoli; le domande nelle FAQ no", () => {
    const plan = planFor(anglePerimeter(), { rules: ANGLE_RULES });

    expect(plan.pages.filter((page) => page.kind === "SPOKE").map((page) => page.main)).toEqual(["scarpe running donna", "scarpe running uomo"]);
    expect(plan.angles).toEqual(["scarpe running trail", "scarpe running bambino", "scarpe running pronatore"]);
    expect(plan.angles).not.toContain("come scegliere scarpe running");
    expect(plan.angles).not.toContain("scarpe running trail fango");
    expect(pageWith(plan, "come scegliere scarpe running")).toBeDefined();
    for (const angle of plan.angles!) {
      expect(plan.pages.filter((page) => page.secondary.includes(angle))).toHaveLength(1);
      expect(plan.pages.some((page) => page.main === angle)).toBe(false);
    }
  });

  // covers: AC-6702-2
  it("luoghi e concorrenti non sono mai angoli, anche quando la pagina locale è oltre il massimo di spoke", () => {
    const plan = planFor(anglePerimeter(true), {
      rules: ANGLE_RULES,
      classes: [...placeClasses(ANGLE_PLACES), ["scarpe running decathlon", "competitor"]],
    });

    expect(plan.pages.some((page) => page.contentType === "local")).toBe(false);
    expect(plan.unassignedReasons?.["scarpe running decathlon"]).toBe("COMPETITOR");
    expect(plan.angles).toEqual(["scarpe running trail", "scarpe running bambino", "scarpe running pronatore"]);
    for (const excluded of [...ANGLE_PLACES, "scarpe running decathlon"]) expect(plan.angles).not.toContain(excluded);
  });
});
