// Gate di T-2302 (AC-2302-1): il prossimo passo e lo stato delle tappe si calcolano in una funzione pura dallo stato
// del progetto (D-39).
import { describe, expect, it } from "vitest";
import { computeProjectProgress, type TopicProgressState } from "@/lib/modules/next-step";

function topic(overrides: Partial<TopicProgressState>): TopicProgressState {
  return { id: "T1", keptCount: 0, totalCount: 0, seedCount: 1, activeJobId: null, ...overrides };
}

describe("computeProjectProgress", () => {
  // covers: AC-2302-1
  it("dai cinque stati del percorso restituisce add_topic, searching, run_topic, build_plan e open_plan", () => {
    const withKeywords = topic({ keptCount: 34, totalCount: 40 });
    const states = [
      { topics: [], latestStrategyId: null },
      { topics: [topic({ activeJobId: "J1" })], latestStrategyId: null },
      { topics: [topic({ seedCount: 2 })], latestStrategyId: null },
      { topics: [withKeywords], latestStrategyId: null },
      { topics: [withKeywords], latestStrategyId: "S1" },
    ];

    const results = states.map(computeProjectProgress);

    expect(results.map((result) => result.next.kind)).toEqual(["add_topic", "searching", "run_topic", "build_plan", "open_plan"]);
    expect(results.map((result) => result.steps.keywords)).toEqual(["current", "current", "current", "done", "done"]);
    expect(results.map((result) => result.steps.plan === "done")).toEqual([false, false, false, false, true]);
    expect(results[1].next).toEqual({ kind: "searching", topicId: "T1", jobId: "J1" });
    expect(results[2].next).toEqual({ kind: "run_topic", topicId: "T1" });
    expect(results[4].next).toEqual({ kind: "open_plan", strategyId: "S1" });
  });

  it("run_topic sceglie il primo argomento con una seed; senza seed resta add_topic", () => {
    const noSeeds = topic({ id: "A", seedCount: 0 });

    expect(computeProjectProgress({ topics: [noSeeds, topic({ id: "B" })], latestStrategyId: null }).next).toEqual({
      kind: "run_topic",
      topicId: "B",
    });
    expect(computeProjectProgress({ topics: [noSeeds], latestStrategyId: null }).next).toEqual({ kind: "add_topic" });
  });

  it("con keyword tenute in un argomento un argomento ancora vuoto non blocca la costruzione del piano", () => {
    const progress = computeProjectProgress({
      topics: [topic({ id: "A", keptCount: 5, totalCount: 5 }), topic({ id: "B" })],
      latestStrategyId: null,
    });

    expect(progress).toEqual({ steps: { keywords: "done", plan: "current" }, next: { kind: "build_plan" } });
  });
});
