// Gate di T-701 (AC-701-1…AC-701-4): budget di query a livelli con giro round-robin tra le seed
// e troncamento dichiarato.
import { describe, expect, it } from "vitest";
import { buildExpansionQueries } from "@/lib/modules/expansion-engine";

// Gli 8 pattern globali di prisma/seed.ts.
const GLOBAL_PATTERNS = [
  "{seed} for beginners",
  "best {seed}",
  "{seed} near me",
  "how to {seed}",
  "{seed} vs {seed} alternative",
  "free {seed} tool",
  "{seed} template",
  "{seed} examples",
];

function allExpansions(seeds: string[], limit: number) {
  return buildExpansionQueries({
    seeds,
    expandAlpha: true,
    expandNumeric: true,
    expandPatterns: true,
    patterns: GLOBAL_PATTERNS,
    limit,
  });
}

function queriesOfSeed(queries: string[], seed: string): string[] {
  return queries.filter((query) => query.split(" ").includes(seed));
}

describe("buildExpansionQueries con budget a livelli", () => {
  // covers: AC-701-1
  it("con 10 seed e limite 250 ogni seed riceve 25 query e il troncamento è dichiarato", () => {
    const seeds = ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10"];

    const result = allExpansions(seeds, 250);

    expect(result.queries).toHaveLength(250);
    expect(result.queries.slice(0, 10)).toEqual(["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10"]);
    for (const seed of seeds) {
      const own = queriesOfSeed(result.queries, seed);
      expect(own).toHaveLength(25);
      expect(own.filter((query) => /^s\d\d [a-z]$/.test(query))).toEqual(
        "abcdefghijklmnop".split("").map((letter) => `${seed} ${letter}`)
      );
    }
    expect(result.truncated).toBe(true);
    expect(result.skippedQueries).toBe(200);
  });

  // covers: AC-701-2
  it("con 3 seed e limite 250 genera 135 query nell'ordine base, pattern, lettere, cifre", () => {
    const result = allExpansions(["alfa", "beta", "gamma"], 250);

    expect(result.queries).toHaveLength(135);
    expect(result.queries.slice(0, 3)).toEqual(["alfa", "beta", "gamma"]);
    const patterns = result.queries.slice(3, 27);
    const patternQueries = GLOBAL_PATTERNS.flatMap((pattern) =>
      ["alfa", "beta", "gamma"].map((seed) => pattern.replaceAll("{seed}", seed))
    );
    expect(patterns).toHaveLength(24);
    expect([...patterns].sort()).toEqual(patternQueries.sort());
    const letters = result.queries.slice(27, 105);
    expect(letters).toHaveLength(78);
    expect(letters.every((query) => /^(alfa|beta|gamma) [a-z]$/.test(query))).toBe(true);
    const digits = result.queries.slice(105, 135);
    expect(digits).toHaveLength(30);
    expect(digits.every((query) => /^(alfa|beta|gamma) [0-9]$/.test(query))).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.skippedQueries).toBe(0);
  });

  // covers: AC-701-3
  it("dentro il livello alfabetico le seed si alternano", () => {
    const result = buildExpansionQueries({
      seeds: ["alfa", "beta"],
      expandAlpha: true,
      expandNumeric: false,
      expandPatterns: false,
      patterns: GLOBAL_PATTERNS,
      limit: 250,
    });

    expect(result.queries.slice(2, 6)).toEqual(["alfa a", "beta a", "alfa b", "beta b"]);
  });

  // covers: AC-701-4
  it("con 300 seed e limite 250 restano solo le prime 250 basi", () => {
    const seeds = Array.from({ length: 300 }, (_, index) => `parola${String(index + 1).padStart(3, "0")}`);

    const result = allExpansions(seeds, 250);

    expect(result.queries).toEqual(seeds.slice(0, 250));
    expect(result.queries.some((query) => query.includes(" "))).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.skippedQueries).toBe(13250);
  });
});
