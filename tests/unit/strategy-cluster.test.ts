// Gate di T-1901 (AC-1901-1…4): il motore hub and spoke restituisce il piano scritto a mano per le fixture italiana e
// inglese, lo stesso piano per ogni ordine delle keyword, e rispetta le soglie degli spoke e le lingue senza dizionario.
import { describe, expect, it } from "vitest";
import { buildStrategyPlan } from "@/lib/modules/strategy/cluster";
import { DEFAULT_RULES } from "@/lib/modules/strategy/rules";
import type { StrategyKeywordInput, StrategyPlan } from "@/lib/modules/strategy/types";
import { describePlan, ENGLISH_FIXTURE, fixtureInputs, ITALIAN_FIXTURE } from "../helpers/strategy";

function planOf(fixture: typeof ITALIAN_FIXTURE, keywords = fixtureInputs(fixture)): StrategyPlan {
  return buildStrategyPlan({ keywords, seeds: fixture.seeds, language: fixture.language, rules: DEFAULT_RULES });
}

/** Generatore pseudocasuale con seme fisso (mulberry32): permutazioni ripetibili. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function keyword(text: string, volume: number | null, overrides: Partial<StrategyKeywordInput> = {}): StrategyKeywordInput {
  return {
    sourceId: null,
    keyword: text,
    canonical: text,
    volume,
    score: 50,
    scoreSource: "metrics",
    searchIntent: "mixed",
    keywordType: "generic",
    isQuestion: false,
    isLocal: false,
    ...overrides,
  };
}

describe("buildStrategyPlan", () => {
  // covers: AC-1901-1
  it("con la fixture italiana e la seed 'scarpe running' restituisce il piano atteso", () => {
    const plan = planOf(ITALIAN_FIXTURE);

    expect(describePlan(plan)).toEqual(ITALIAN_FIXTURE.expected);
  });

  // covers: AC-1901-2
  it("50 permutazioni della fixture italiana danno lo stesso piano, con ogni keyword in al massimo una pagina", () => {
    const reference = planOf(ITALIAN_FIXTURE);
    const random = seededRandom(1901);

    for (let run = 0; run < 50; run += 1) {
      const plan = planOf(ITALIAN_FIXTURE, shuffled(fixtureInputs(ITALIAN_FIXTURE), random));
      expect(plan).toEqual(reference);

      const placed = plan.pages.flatMap((page) => [page.main, ...page.secondary]);
      expect(new Set(placed).size).toBe(placed.length);
      expect(placed.filter((canonical) => plan.unassigned.includes(canonical))).toEqual([]);
      for (const page of plan.pages) {
        expect(typeof page.main).toBe("string");
        expect(page.secondary).not.toContain(page.main);
      }
    }
  });

  // covers: AC-1901-3
  it("con la fixture inglese senza seed corrispondenti gli hub nascono dai termini più ricorrenti pesati per volume", () => {
    const plan = planOf(ENGLISH_FIXTURE);
    const described = describePlan(plan);

    expect(described.pages.filter((page) => page.kind === "HUB").map((page) => page.main)).toEqual([
      "running shoes",
      "running socks",
      "marathon training",
    ]);
    expect(described).toEqual(ENGLISH_FIXTURE.expected);
  });

  // covers: AC-1901-4
  it("un gruppo da 1 keyword a 40 ricerche resta nella pilastro e oltre 12 spoke i meno prioritari confluiscono", () => {
    const words = [
      "arabica", "robusta", "decaffeinato", "macinato", "grani", "capsule", "cialde", "biologico",
      "espresso", "lungo", "freddo", "ginseng", "orzo", "turco",
    ];
    const keywords = [
      keyword("caffe", 50_000),
      keyword("caffe zuccherato", 40),
      // 14 gruppi idonei: una keyword ciascuno, volumi tutti sopra la soglia di 100 e tutti diversi.
      ...words.map((word, index) => keyword(`caffe ${word}`, 2000 - index * 100)),
    ];

    const plan = buildStrategyPlan({ keywords, seeds: ["caffe"], language: "it", rules: DEFAULT_RULES });
    const pillar = plan.pages.find((page) => page.kind === "HUB")!;
    const spokes = plan.pages.filter((page) => page.hubRef === pillar.ref);

    expect(pillar.main).toBe("caffe");
    expect(pillar.secondary).toContain("caffe zuccherato");
    expect(spokes).toHaveLength(12);
    expect(spokes.map((page) => page.main)).not.toContain("caffe orzo");
    expect(spokes.map((page) => page.main)).not.toContain("caffe turco");
    expect(pillar.secondary).toEqual(expect.arrayContaining(["caffe orzo", "caffe turco"]));
    expect(pillar.reason).toEqual({ code: "HUB_SEED", params: { seed: "caffe", merged: 3, faq: 0 } });

    const german = buildStrategyPlan({
      keywords: [keyword("laufschuhe", 5000), keyword("laufschuhe test", 900), keyword("laufschuhe test damen", 300)],
      seeds: ["laufschuhe"],
      language: "de",
      rules: DEFAULT_RULES,
    });
    expect(german.pages.length).toBeGreaterThan(0);
    expect(german.pages.map((page) => page.reason.code)).not.toContain("SPOKE_MODIFIER");
    expect(german.pages.every((page) => !("category" in page.reason.params))).toBe(true);
  });

  it("senza volumi la priorità è il punteggio complessivo e le keyword con la stessa forma canonica contano una volta", () => {
    const plan = buildStrategyPlan({
      keywords: [
        keyword("scarpe running", null, { score: 80 }),
        keyword("scarpe running", null, { score: 10, sourceId: "doppione" }),
        keyword("scarpe running donna", null, { score: 60 }),
        keyword("scarpe running da donna", null, { score: 50 }),
      ],
      seeds: ["scarpe running"],
      language: "it",
      rules: DEFAULT_RULES,
    });

    expect(describePlan(plan).pages.map(({ main, secondary, priority }) => ({ main, secondary, priority }))).toEqual([
      { main: "scarpe running", secondary: [], priority: 80 },
      { main: "scarpe running donna", secondary: ["scarpe running da donna"], priority: 110 },
    ]);
  });
});
