// Gate di T-306 (AC-306-3, AC-306-4): sopra soglia di query fallite il job fallisce e i risultati
// precedenti restano; sotto soglia il job è completed e parziale, senza keyword fittizie.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { resetAutocompleteCacheForTests } from "@/lib/modules/providers/autocomplete/google-direct";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const SEED = "caffe";
// 1 seed e 9 pattern, senza espansione alfabetica e numerica: 10 query.
const PATTERNS = Array.from({ length: 9 }, (_, index) => `{seed} variante ${index + 1}`);
const QUERIES = [SEED, ...PATTERNS.map((pattern) => pattern.replace("{seed}", SEED))];
const PREVIOUS_KEYWORDS = ["uno", "due", "tre", "quattro"];

let failingQueries = new Set<string>();

const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const query = new URL(String(input)).searchParams.get("q") ?? "";
  if (failingQueries.has(query)) {
    return new Response("", { status: 503 });
  }
  return new Response(JSON.stringify([query, [`${query} suggerimento`]]), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
});

async function createSectionWithPreviousRun() {
  const { user } = await createUserWithSession({ displayName: "t306-owner" });
  const project = await prisma.project.create({
    data: {
      name: "Autocomplete in errore",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "GOOGLE_DIRECT",
      metrics_provider: "NONE",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: true,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: SEED } });
  await prisma.expansionPattern.createMany({
    data: PATTERNS.map((pattern) => ({ project_id: null, pattern, enabled: true })),
  });
  await prisma.keywordCandidate.createMany({
    data: PREVIOUS_KEYWORDS.map((keyword) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
    })),
  });
  return { projectId: project.id, sectionId: section.id };
}

async function runSection(projectId: string, sectionId: string) {
  const { job } = await enqueueExtractionJob(projectId, sectionId);
  await runJobById(job.id);
  return prisma.job.findUniqueOrThrow({ where: { id: job.id } });
}

beforeAll(() => {
  vi.stubEnv("AUTOCOMPLETE_MAX_RETRIES", "0");
  vi.stubEnv("AUTOCOMPLETE_RATE_LIMIT_MS", "50");
  vi.stubEnv("MAX_EXPANSION_QUERIES", "250");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  fetchMock.mockClear();
  resetAutocompleteCacheForTests();
  await resetDatabase();
});

describe("pipeline con autocomplete in errore sopra soglia", () => {
  // covers: AC-306-3
  it("il job è failed con 4 query su 10 e la sezione conserva le 4 candidate precedenti", async () => {
    failingQueries = new Set(QUERIES.slice(0, 4));
    const { projectId, sectionId } = await createSectionWithPreviousRun();

    const job = await runSection(projectId, sectionId);

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(job.status).toBe("failed");
    expect(job.error_message).toContain("4 query su 10");
    const rows = await prisma.keywordCandidate.findMany({ where: { subproject_id: sectionId } });
    expect(rows.map((row) => row.keyword).sort()).toEqual([...PREVIOUS_KEYWORDS].sort());
  });
});

describe("pipeline con autocomplete in errore sotto soglia", () => {
  // covers: AC-306-4
  it("il job è completed, parziale con 2 query fallite e senza candidate google-direct-fallback", async () => {
    failingQueries = new Set(QUERIES.slice(0, 2));
    const { projectId, sectionId } = await createSectionWithPreviousRun();

    const job = await runSection(projectId, sectionId);
    const result = job.result as { partial?: boolean; failedQueries?: number } | null;

    expect(job.status).toBe("completed");
    expect(result?.partial).toBe(true);
    expect(result?.failedQueries).toBe(2);
    expect(
      await prisma.keywordCandidate.count({ where: { subproject_id: sectionId, source: "google-direct-fallback" } })
    ).toBe(0);
  });
});
