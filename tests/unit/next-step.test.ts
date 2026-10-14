// Gate di T-2302 (AC-2302-1): il prossimo passo e lo stato delle tappe si calcolano in una funzione pura dallo stato
// del progetto (D-39).
// Gate di T-2506 (AC-2506-1): con un piano il prossimo passo segue la scrittura delle pagine.
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

    // impacted-by: T-2506 (tappa Scrittura, da fare finché non c'è un piano)
    expect(progress).toEqual({ steps: { keywords: "done", plan: "current", writing: "todo" }, next: { kind: "build_plan" } });
  });
});

describe("computeProjectProgress con la scrittura del piano (T-2506)", () => {
  // covers: AC-2506-1
  it("dai tre stati del piano restituisce write_next con la pagina della posizione 4, writing e plan_done", () => {
    const withKeywords = [topic({ keptCount: 34, totalCount: 40 })];
    const fourth = { id: "P4", h1: "Scarpe running donna: guida completa", number: 4 };
    const plans = [
      { version: 7, todo: 6, writing: 2, published: 1, firstTodo: fourth },
      { version: 7, todo: 0, writing: 2, published: 7, firstTodo: null },
      { version: 7, todo: 0, writing: 0, published: 9, firstTodo: null },
    ];

    const results = plans.map((plan) => computeProjectProgress({ topics: withKeywords, latestStrategyId: "S1", plan }));

    expect(results.map((result) => result.next.kind)).toEqual(["write_next", "writing", "plan_done"]);
    expect(results[0].next).toEqual({ kind: "write_next", strategyId: "S1", version: 7, page: fourth });
    expect(results[1].next).toEqual({ kind: "writing", strategyId: "S1", count: 2 });
    expect(results.map((result) => result.steps.writing)).toEqual(["current", "current", "done"]);
    expect(results.map((result) => result.steps.plan)).toEqual(["done", "done", "done"]);
  });

  it("un piano senza pagine resta open_plan con la tappa Scrittura da fare", () => {
    const progress = computeProjectProgress({
      topics: [topic({ keptCount: 3, totalCount: 3 })],
      latestStrategyId: "S1",
      plan: { version: 0, todo: 0, writing: 0, published: 0, firstTodo: null },
    });

    expect(progress).toEqual({ steps: { keywords: "done", plan: "done", writing: "todo" }, next: { kind: "open_plan", strategyId: "S1" } });
  });
});
