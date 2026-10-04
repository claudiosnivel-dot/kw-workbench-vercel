// Caratterizzazione di T-106: golden master di runExtractionPipeline con autocomplete e
// metriche MOCK. Ogni cambiamento di normalizzazione, classificazione, filtro brand, punteggio
// e salvataggio cambia lo snapshot: il suo aggiornamento (T-306, T-702, T-705, T-707) passa da
// gate umano con diff motivato.
// Oracolo di non regressione degli upgrade di 04-stack-upgrade (snapshot invariati):
// covers: AC-401-3
// covers: AC-403-4
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

// Default globali di prisma/seed.ts.
const DEFAULT_BRANDS = ["google", "amazon", "youtube", "facebook", "instagram"];
const DEFAULT_PATTERNS = [
  "{seed} for beginners",
  "best {seed}",
  "{seed} near me",
  "how to {seed}",
  "{seed} vs {seed} alternative",
  "free {seed} tool",
  "{seed} template",
  "{seed} examples",
];
const SEEDS = ["caffè moka", "amazon kindle offerte", "how to learn seo"];

const fetchStub = vi.fn(() => {
  throw new Error("fetch non ammesso nel golden master della pipeline");
});

async function insertGlobalDefaults(): Promise<void> {
  await prisma.brandBlacklist.createMany({
    data: DEFAULT_BRANDS.map((brand) => ({ project_id: null, brand, reason: "Global brand default" })),
  });
  await prisma.expansionPattern.createMany({
    data: DEFAULT_PATTERNS.map((pattern) => ({ project_id: null, pattern, enabled: true })),
  });
}

async function createSection(seeds: string[]): Promise<string> {
  const { user } = await createUserWithSession({ username: "golden-owner" });
  const project = await prisma.project.create({
    data: {
      name: "Golden master",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "MOCK",
      exclude_brands: true,
      auto_classification: true,
      scoring_profile: "balanced",
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.createMany({
    data: seeds.map((keyword) => ({ project_id: project.id, subproject_id: section.id, keyword })),
  });
  return section.id;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Campi dichiarati dal golden master, ordinati per canonical_keyword e poi keyword. */
async function goldenRows(subprojectId: string) {
  const rows = await prisma.keywordCandidate.findMany({ where: { subproject_id: subprojectId } });
  return rows
    .map((row) => ({
      keyword: row.keyword,
      normalized_keyword: row.normalized_keyword,
      canonical_keyword: row.canonical_keyword,
      score: row.score,
      search_intent: row.search_intent,
      keyword_type: row.keyword_type,
      brand_status: row.brand_status,
      review_status: row.review_status,
      selected_for_export: row.selected_for_export,
      metrics_status: row.metrics_status,
      avg_monthly_searches: row.avg_monthly_searches,
    }))
    .sort((a, b) => compareText(a.canonical_keyword, b.canonical_keyword) || compareText(a.keyword, b.keyword));
}

beforeAll(() => {
  vi.stubEnv("MAX_EXPANSION_QUERIES", "250");
  vi.stubEnv("AUTOCOMPLETE_CONCURRENCY", "6");
  vi.stubGlobal("fetch", fetchStub);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  fetchStub.mockClear();
  await resetDatabase();
  await insertGlobalDefaults();
});

describe("golden master della pipeline di estrazione", () => {
  // covers: AC-106-1
  it("le candidate prodotte coincidono con lo snapshot senza chiamate di rete", async () => {
    const subprojectId = await createSection(SEEDS);

    await runExtractionPipeline(subprojectId);

    expect(await goldenRows(subprojectId)).toMatchSnapshot();
    expect(fetchStub).toHaveBeenCalledTimes(0);
  });

  // covers: AC-106-2
  it("il riepilogo restituito coincide con il DB e con lo snapshot", async () => {
    const subprojectId = await createSection(SEEDS);

    const summary = await runExtractionPipeline(subprojectId);

    expect(summary.queries).toBe(135);
    expect(summary.storedCandidates).toBe(await prisma.keywordCandidate.count({ where: { subproject_id: subprojectId } }));
    // Aggiornata da T-306: il riepilogo dichiara anche partial e failedQueries.
    expect({
      queries: summary.queries,
      rawSuggestions: summary.rawSuggestions,
      dedupedCandidates: summary.dedupedCandidates,
      storedCandidates: summary.storedCandidates,
      partial: summary.partial,
      failedQueries: summary.failedQueries,
    }).toMatchSnapshot();
  });

  // covers: AC-106-3
  it("la riesecuzione riproduce le stesse candidate e riporta a pending quelle approvate", async () => {
    const subprojectId = await createSection(SEEDS);
    await runExtractionPipeline(subprojectId);
    const firstRun = await goldenRows(subprojectId);
    const approved = firstRun.find((row) => row.review_status === "pending");
    expect(approved).toBeDefined();
    await prisma.keywordCandidate.updateMany({
      where: { subproject_id: subprojectId, canonical_keyword: approved?.canonical_keyword },
      data: { review_status: "approved" },
    });

    await runExtractionPipeline(subprojectId);

    const secondRun = await goldenRows(subprojectId);
    expect(secondRun).toEqual(firstRun);
    expect(secondRun).toHaveLength(firstRun.length);
    const rerun = secondRun.find((row) => row.canonical_keyword === approved?.canonical_keyword);
    // impacted-by: T-705
    expect(rerun?.review_status).toBe("pending");
  });

  // covers: AC-106-4
  it("una sezione senza seed svuota le candidate preesistenti", async () => {
    const subprojectId = await createSection([]);
    const section = await prisma.subproject.findUniqueOrThrow({ where: { id: subprojectId } });
    await prisma.keywordCandidate.createMany({
      data: ["uno", "due", "tre", "quattro"].map((keyword) => ({
        project_id: section.project_id,
        subproject_id: subprojectId,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: keyword,
      })),
    });

    const summary = await runExtractionPipeline(subprojectId);

    expect(summary).toEqual({ queries: 0, rawSuggestions: 0, dedupedCandidates: 0, storedCandidates: 0 });
    // impacted-by: T-706
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: subprojectId } })).toBe(0);
  });
});
