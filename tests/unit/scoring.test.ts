// Gate di T-707 (AC-707-1, AC-707-2): il punteggio dichiara la sorgente e la pulizia si misura sul
// testo grezzo della keyword.
import { describe, expect, it } from "vitest";
import { scoreKeyword, type ScoreInput } from "@/lib/modules/scoring";

const BASE: ScoreInput = {
  raw_keyword: "offerte",
  keyword: "offerte",
  brand_status: "allowed",
  search_intent: "mixed",
  metrics_status: "missing",
  scoring_profile: "balanced",
};

describe("sorgente del punteggio", () => {
  // covers: AC-707-1
  it("metrics per fetched, imported e mock; heuristic per missing e failed", () => {
    const sources = (["fetched", "imported", "mock", "missing", "failed"] as const).map(
      (metrics_status) => scoreKeyword({ ...BASE, metrics_status, avg_monthly_searches: 1000, competition: 0.5 }).score_source
    );

    expect(sources).toEqual(["metrics", "metrics", "metrics", "heuristic", "heuristic"]);
  });
});

describe("pulizia sul testo grezzo", () => {
  // covers: AC-707-2
  it("i simboli ripetuti della keyword grezza abbassano il punteggio euristico", () => {
    const noisy = scoreKeyword({ ...BASE, raw_keyword: "!!!! offerte $$$$" });
    const clean = scoreKeyword({ ...BASE, raw_keyword: "offerte" });

    expect(noisy.score).toBeCloseTo(62.5, 10);
    expect(clean.score).toBeCloseTo(80.5, 10);
    expect(noisy.score_source).toBe("heuristic");
  });
});
