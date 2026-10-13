// Gate di T-2401 (AC-2401-1…4): un solo stato tieni/scarta. La migrazione 0042 scarta i marchi esclusi ancora da
// rivedere ed elimina selected_for_export; la pipeline fa entrare scartati i marchi esclusi e il re-run conserva la
// scelta; il perimetro automatico delle strategie usa la regola unica; la PATCH dei risultati ha solo keep e discard.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { PATCH as patchResults } from "@/app/api/projects/[id]/results/route";
import type { Prisma } from "@/lib/generated/prisma/client";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { createTemporaryDatabase, type TemporaryDatabase } from "../helpers/migrations";

const KEEP_DISCARD_MIGRATION = "0042_keep_discard";

// Autocomplete e metriche finti controllati dal test: nessuna richiesta esce verso Google.
const providers = vi.hoisted(() => ({ suggestions: [] as string[] }));

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      providers.suggestions.map((keyword) => ({ keyword, source: "mock-autocomplete", sourceQuery: query })),
  }),
}));

vi.mock("@/lib/modules/providers/metrics/factory", () => ({
  createMetricsProvider: () => ({
    id: "MOCK",
    enrichKeywords: async (items: { canonical: string }[]) => ({
      metrics: new Map(
        items.map(({ canonical: keyword }) => [
          keyword,
          { keyword, metrics_status: "mock", metrics_provider: "MOCK", avg_monthly_searches: 100, competition: 0.5 },
        ])
      ),
    }),
  }),
}));

type KeywordData = Partial<Prisma.KeywordCandidateCreateManyInput> & { keyword: string };

async function insertKeywords(projectId: string, sectionId: string, rows: KeywordData[]) {
  await prisma.keywordCandidate.createMany({
    data: rows.map((row) => ({
      project_id: projectId,
      subproject_id: sectionId,
      normalized_keyword: row.keyword,
      canonical_keyword: row.keyword,
      source: "seed",
      source_query: row.keyword,
      ...row,
    })),
  });
}

async function ownerProject() {
  const owner = await createUserWithSession({ displayName: `t2401-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({
    data: {
      name: "Scarpe",
      workspace_id: owner.workspaceId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "MOCK",
      exclude_brands: true,
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Running", position: 0 } });
  return { owner, projectId: project.id, sectionId: section.id };
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  providers.suggestions = [];
  await resetDatabase();
});

describe("migrazione 0042_keep_discard", () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createTemporaryDatabase();
    await database.migrateBefore(KEEP_DISCARD_MIGRATION);
  });

  afterEach(async () => {
    await database.drop();
  });

  // covers: AC-2401-1
  it("scarta i marchi esclusi da rivedere, lascia le altre scelte ed elimina selected_for_export", async () => {
    const { client } = database;
    await client.query(`INSERT INTO "workspaces" ("id", "name", "slug", "updated_at") VALUES ('w1', 'W', 'w-0042', now())`);
    await client.query(`INSERT INTO "projects" ("id", "workspace_id", "name", "updated_at") VALUES ('p1', 'w1', 'P', now())`);
    await client.query(`INSERT INTO "subprojects" ("id", "project_id", "name", "updated_at") VALUES ('s1', 'p1', 'S', now())`);
    for (const [id, brand, review] of [
      ["k1", "excluded", "pending"],
      ["k2", "excluded", "approved"],
      ["k3", "allowed", "pending"],
    ]) {
      await client.query(
        `INSERT INTO "keyword_candidates" ("id", "project_id", "subproject_id", "keyword", "normalized_keyword",
          "canonical_keyword", "source", "source_query", "brand_status", "review_status", "selected_for_export", "updated_at")
         VALUES ($1, 'p1', 's1', $1, $1, $1, 'seed', $1, $2::"BrandStatus", $3::"ReviewStatus", true, now())`,
        [id, brand, review]
      );
    }

    await database.apply(KEEP_DISCARD_MIGRATION);

    const rows = await client.query(`SELECT "id", "review_status" FROM "keyword_candidates" ORDER BY "id"`);
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'keyword_candidates' AND column_name = 'selected_for_export'`
    );
    expect(rows.rows).toEqual([
      { id: "k1", review_status: "rejected" },
      { id: "k2", review_status: "approved" },
      { id: "k3", review_status: "pending" },
    ]);
    expect(columns.rows).toEqual([]);
  });
});

describe("tieni e scarta nella pipeline", () => {
  // covers: AC-2401-2
  it("il marchio escluso entra scartato e, tenuto dall'utente, resta tenuto dopo il re-run", async () => {
    const { owner, projectId, sectionId } = await ownerProject();
    await prisma.brandBlacklist.create({ data: { project_id: projectId, brand: "nike" } });
    await prisma.seed.create({ data: { project_id: projectId, subproject_id: sectionId, keyword: "scarpe" } });
    providers.suggestions = ["nike pegasus", "scarpe running"];
    const read = async () =>
      prisma.keywordCandidate.findMany({
        where: { subproject_id: sectionId, keyword: { in: providers.suggestions } },
        select: { id: true, keyword: true, review_status: true, brand_status: true },
        orderBy: { keyword: "asc" },
      });

    await runExtractionPipeline(sectionId);
    const first = await read();
    const nike = first.find((row) => row.keyword === "nike pegasus");
    const kept = await callRoute(patchResults, {
      method: "PATCH",
      url: `/api/projects/${projectId}/results`,
      cookie: owner.cookie,
      params: { id: projectId },
      body: { action: "keep", ids: [nike?.id], subprojectId: sectionId },
    });
    await runExtractionPipeline(sectionId);
    const second = await read();

    expect(first.map(({ keyword, review_status, brand_status }) => [keyword, review_status, brand_status])).toEqual([
      ["nike pegasus", "rejected", "excluded"],
      ["scarpe running", "pending", "allowed"],
    ]);
    expect(kept.status).toBe(200);
    expect(second.find((row) => row.keyword === "nike pegasus")?.review_status).toBe("approved");
  });
});

describe("regola unica nel piano", () => {
  // covers: AC-2401-3
  it("la strategia automatica contiene le tenute, anche il marchio escluso tenuto a mano, e non la scartata", async () => {
    const { owner, projectId, sectionId } = await ownerProject();
    await insertKeywords(projectId, sectionId, [
      { keyword: "scarpe running donna", review_status: "pending", avg_monthly_searches: 2100 },
      { keyword: "scarpe running", review_status: "approved", avg_monthly_searches: 9900 },
      { keyword: "scarpe running uomo", review_status: "rejected", avg_monthly_searches: 1600 },
      { keyword: "scarpe running nike", review_status: "approved", brand_status: "excluded", avg_monthly_searches: 1300 },
    ]);
    await prisma.seed.create({ data: { project_id: projectId, subproject_id: sectionId, keyword: "scarpe running" } });

    const response = await callRoute(createStrategy, {
      method: "POST",
      url: `/api/projects/${projectId}/strategies`,
      cookie: owner.cookie,
      params: { id: projectId },
      body: { mode: "AUTO" },
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { id: string } };
    const keywords = await prisma.strategyKeyword.findMany({ where: { strategy_id: data.id }, select: { canonical_keyword: true } });
    expect(keywords.map((row) => row.canonical_keyword).sort()).toEqual(
      ["scarpe running", "scarpe running donna", "scarpe running nike"].sort()
    );
  });
});

describe("PATCH dei risultati con tieni e scarta", () => {
  // covers: AC-2401-4
  it("scarta le 4 domande del set filtrato, lascia le altre 6 e rifiuta l'azione select", async () => {
    const { owner, projectId, sectionId } = await ownerProject();
    await insertKeywords(
      projectId,
      sectionId,
      Array.from({ length: 10 }, (_, index) => ({
        keyword: index < 4 ? `come scegliere le scarpe ${index}` : `scarpe modello ${index}`,
        is_question: index < 4,
      }))
    );
    const before = await prisma.keywordCandidate.findMany({ where: { project_id: projectId }, select: { id: true, review_status: true } });
    const patch = (body: unknown) =>
      callRoute(patchResults, { method: "PATCH", url: `/api/projects/${projectId}/results`, cookie: owner.cookie, params: { id: projectId }, body });

    const discarded = await patch({ action: "discard", filters: { chip: "questions" }, subprojectId: sectionId });
    const select = await patch({ action: "select", ids: before.map((row) => row.id) });

    expect(discarded.status).toBe(200);
    expect(await discarded.json()).toEqual({ success: true, updated: 4 });
    const after = await prisma.keywordCandidate.findMany({ where: { project_id: projectId }, select: { is_question: true, review_status: true } });
    expect(after.filter((row) => row.is_question).map((row) => row.review_status)).toEqual(Array(4).fill("rejected"));
    expect(after.filter((row) => !row.is_question).map((row) => row.review_status)).toEqual(Array(6).fill("pending"));
    expect(select.status).toBe(400);
    expect(((await select.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
  });
});
