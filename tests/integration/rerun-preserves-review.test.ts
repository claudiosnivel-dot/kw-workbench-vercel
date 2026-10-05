// Gate di T-705 (AC-705-1…AC-705-4): il re-run conserva revisione, selezione e id delle keyword
// ancora prodotte, rimuove le altre della sola sezione e aggiorna metriche e punteggio (D-19).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Autocomplete e metriche mock controllati dal test: suggerimenti e volumi cambiano tra i run.
const providers = vi.hoisted(() => ({
  suggestions: [] as string[],
  volumes: new Map<string, number>(),
}));

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      providers.suggestions.map((keyword) => ({ keyword, source: "mock-autocomplete", sourceQuery: query })),
  }),
}));

// impacted-by: T-901 — il mock segue il contratto MetricsProvider (item con canonical, esito con la mappa).
vi.mock("@/lib/modules/providers/metrics/factory", () => ({
  createMetricsProvider: () => ({
    id: "MOCK",
    enrichKeywords: async (items: { canonical: string }[]) => ({
      metrics: new Map(
        items.map(({ canonical: keyword }) => [
          keyword,
          {
            keyword,
            metrics_status: "mock",
            metrics_provider: "MOCK",
            avg_monthly_searches: providers.volumes.get(keyword) ?? 50,
            competition: 0.5,
          },
        ])
      ),
    }),
  }),
}));

const SEED = "scarpe";
const APPROVED = ["scarpe running", "scarpe trail", "scarpe tennis"];
const REJECTED = ["scarpe usate", "scarpe gratis"];
const DESELECTED = "scarpe eleganti";
const FIRST_RUN = [...APPROVED, ...REJECTED, DESELECTED];
// Il secondo run produce ancora 4 delle 6 keyword revisionate.
const STILL_PRODUCED = ["scarpe running", "scarpe trail", "scarpe usate", DESELECTED];
const NO_LONGER_PRODUCED = ["scarpe tennis", "scarpe gratis"];

async function createProject() {
  const { user } = await createUserWithSession({ username: "t705-owner" });
  const project = await prisma.project.create({
    data: {
      name: "Re-run",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "MOCK",
      exclude_brands: true,
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
      auto_classification: true,
      scoring_profile: "balanced",
    },
  });
  await prisma.brandBlacklist.create({ data: { project_id: project.id, brand: "nike" } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: SEED } });
  return { projectId: project.id, sectionId: section.id };
}

async function runWith(sectionId: string, suggestions: string[]) {
  providers.suggestions = suggestions;
  return runExtractionPipeline(sectionId);
}

async function reviewFirstRun(sectionId: string) {
  await prisma.keywordCandidate.updateMany({
    where: { subproject_id: sectionId, keyword: { in: APPROVED } },
    data: { review_status: "approved" },
  });
  await prisma.keywordCandidate.updateMany({
    where: { subproject_id: sectionId, keyword: { in: REJECTED } },
    data: { review_status: "rejected" },
  });
  await prisma.keywordCandidate.updateMany({
    where: { subproject_id: sectionId, keyword: DESELECTED },
    data: { selected_for_export: false },
  });
}

async function snapshotOf(sectionId: string, keywords: string[]) {
  const rows = await prisma.keywordCandidate.findMany({
    where: { subproject_id: sectionId, keyword: { in: keywords } },
    select: { keyword: true, id: true, review_status: true, selected_for_export: true },
    orderBy: { keyword: "asc" },
  });
  return rows;
}

beforeEach(async () => {
  providers.suggestions = [];
  providers.volumes = new Map();
  await resetDatabase();
});

describe("re-run di una sezione già revisionata", () => {
  // covers: AC-705-1
  it("le keyword ancora prodotte conservano id, revisione e selezione", async () => {
    const { sectionId } = await createProject();
    await runWith(sectionId, FIRST_RUN);
    await reviewFirstRun(sectionId);
    const before = await snapshotOf(sectionId, STILL_PRODUCED);
    expect(before).toHaveLength(4);

    await runWith(sectionId, STILL_PRODUCED);

    const after = await snapshotOf(sectionId, STILL_PRODUCED);
    expect(after).toEqual(before);
    expect(after.map((row) => [row.keyword, row.review_status, row.selected_for_export])).toEqual([
      ["scarpe eleganti", "pending", false],
      ["scarpe running", "approved", true],
      ["scarpe trail", "approved", true],
      ["scarpe usate", "rejected", true],
    ]);
  });

  // covers: AC-705-2
  it("le keyword non più prodotte spariscono e l'altra sezione resta intatta", async () => {
    const { projectId, sectionId } = await createProject();
    const other = await prisma.subproject.create({ data: { project_id: projectId, name: "Altra", position: 1 } });
    await prisma.keywordCandidate.createMany({
      data: Array.from({ length: 15 }, (_, index) => ({
        project_id: projectId,
        subproject_id: other.id,
        keyword: `altra ${index}`,
        normalized_keyword: `altra ${index}`,
        canonical_keyword: `altra ${index}`,
        source: "seed",
        source_query: `altra ${index}`,
      })),
    });
    const otherIds = (await prisma.keywordCandidate.findMany({ where: { subproject_id: other.id }, select: { id: true } }))
      .map((row) => row.id)
      .sort();
    await runWith(sectionId, FIRST_RUN);
    await reviewFirstRun(sectionId);

    await runWith(sectionId, STILL_PRODUCED);

    expect(
      await prisma.keywordCandidate.count({
        where: { subproject_id: sectionId, canonical_keyword: { in: NO_LONGER_PRODUCED } },
      })
    ).toBe(0);
    const otherAfter = await prisma.keywordCandidate.findMany({ where: { subproject_id: other.id }, select: { id: true } });
    expect(otherAfter).toHaveLength(15);
    expect(otherAfter.map((row) => row.id).sort()).toEqual(otherIds);
  });

  // covers: AC-705-3
  it("le keyword nuove ricevono i default: pending e selezionata, rejected se il brand è escluso", async () => {
    const { sectionId } = await createProject();
    await runWith(sectionId, FIRST_RUN);
    await reviewFirstRun(sectionId);

    await runWith(sectionId, [...STILL_PRODUCED, "scarpe vegane", "scarpe nike nuove"]);

    const fresh = await prisma.keywordCandidate.findFirstOrThrow({
      where: { subproject_id: sectionId, keyword: "scarpe vegane" },
    });
    const branded = await prisma.keywordCandidate.findFirstOrThrow({
      where: { subproject_id: sectionId, keyword: "scarpe nike nuove" },
    });
    expect([fresh.review_status, fresh.selected_for_export]).toEqual(["pending", true]);
    expect([branded.review_status, branded.selected_for_export]).toEqual(["rejected", false]);
  });

  // covers: AC-705-4
  it("metriche, punteggio e data delle metriche si aggiornano e la revisione resta", async () => {
    const { sectionId } = await createProject();
    providers.volumes = new Map([["scarpe running", 100]]);
    await runWith(sectionId, FIRST_RUN);
    await reviewFirstRun(sectionId);
    const first = await prisma.keywordCandidate.findFirstOrThrow({
      where: { subproject_id: sectionId, keyword: "scarpe running" },
    });
    expect(first.avg_monthly_searches).toBe(100);

    providers.volumes = new Map([["scarpe running", 900]]);
    await runWith(sectionId, FIRST_RUN);

    const second = await prisma.keywordCandidate.findFirstOrThrow({
      where: { subproject_id: sectionId, keyword: "scarpe running" },
    });
    expect(second.avg_monthly_searches).toBe(900);
    expect(second.score).not.toBe(first.score);
    expect(second.metrics_updated_at?.getTime()).toBeGreaterThan(first.metrics_updated_at?.getTime() ?? Infinity);
    expect(second.review_status).toBe("approved");
  });
});
