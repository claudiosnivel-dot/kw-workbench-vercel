// Gate di T-1202 (AC-1202-1…AC-1202-4): advanceJob esegue l'estrazione a batch ripartibili con lo stesso risultato
// dell'esecuzione in un colpo solo, anche dopo un'eccezione dentro la transazione di un batch; lease occupato e
// annullamento non toccano i risultati.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobPhase, Prisma } from "@/lib/generated/prisma/client";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Seed, default globali e impostazioni del golden master di T-106 (tests/integration/characterization).
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
  throw new Error("fetch non ammesso nei passi del job");
});

let ownerId = "";

async function createSection(seeds: string[]) {
  const project = await prisma.project.create({
    data: {
      name: "Golden master a passi",
      owner_user_id: ownerId,
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
  return { projectId: project.id, sectionId: section.id };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Campi dello snapshot del golden master, ordinati per canonical_keyword e keyword. */
async function snapshotRows(subprojectId: string) {
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

/** Righe dell'esecuzione in un colpo solo (runExtractionPipeline, lo stesso percorso del golden master). */
async function oneShotRows() {
  const { sectionId } = await createSection(SEEDS);
  await runExtractionPipeline(sectionId);
  return snapshotRows(sectionId);
}

async function duplicateSuggestionPairs(jobId: string): Promise<number> {
  const [row] = await prisma.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM (
      SELECT query_index, keyword FROM job_suggestions WHERE job_id = ${jobId}
      GROUP BY query_index, keyword HAVING count(*) > 1
    ) AS duplicates
  `;
  return row.total;
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
  await prisma.brandBlacklist.createMany({
    data: DEFAULT_BRANDS.map((brand) => ({ project_id: null, brand, reason: "Global brand default" })),
  });
  await prisma.expansionPattern.createMany({
    data: DEFAULT_PATTERNS.map((pattern) => ({ project_id: null, pattern, enabled: true })),
  });
  ownerId = (await createUserWithSession({ username: "t1202-owner" })).user.id;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("advanceJob a un batch per chiamata", () => {
  // covers: AC-1202-1
  it("più di 3 chiamate, job completed in fase done e righe identiche all'esecuzione in un colpo solo", async () => {
    const expected = await oneShotRows();
    const { projectId, sectionId } = await createSection(SEEDS);
    const { job } = await enqueueExtractionJob(projectId, sectionId);

    let calls = 0;
    for (let more = true; more; calls += 1) {
      ({ more } = await advanceJob(job.id, Date.now()));
    }

    expect(calls).toBeGreaterThan(3);
    const finished = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe("completed");
    expect(finished.phase).toBe("done");
    expect(await snapshotRows(sectionId)).toEqual(expected);
    expect(fetchStub).toHaveBeenCalledTimes(0);
  });
});

describe("eccezione dentro la transazione di un batch", () => {
  for (const phase of ["autocomplete", "metrics", "store"] as const satisfies readonly JobPhase[]) {
    // covers: AC-1202-2
    it(`in fase ${phase}: dopo la scadenza del lease il job riparte e termina con le stesse righe`, async () => {
      const expected = await oneShotRows();
      const { projectId, sectionId } = await createSection(SEEDS);
      const { job } = await enqueueExtractionJob(projectId, sectionId);

      // L'eccezione arriva dopo le scritture del batch, dentro la sua transazione: tutto va in rollback.
      let pending = true;
      const realTransaction = prisma.$transaction.bind(prisma) as (
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options?: unknown
      ) => Promise<unknown>;
      vi.spyOn(prisma, "$transaction").mockImplementation(((work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) =>
        realTransaction(async (tx) => {
          const current = await tx.job.findUnique({ where: { id: job.id }, select: { phase: true } });
          const result = await work(tx);
          if (pending && current?.phase === phase) {
            pending = false;
            throw new Error(`eccezione iniettata nella fase ${phase}`);
          }
          return result;
        }, options)) as unknown as typeof prisma.$transaction);
      vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });

      let failures = 0;
      for (let more = true; more; ) {
        try {
          ({ more } = await advanceJob(job.id, Date.now()));
        } catch {
          failures += 1;
          // Il lease del passo interrotto resta fino a locked_until: si sposta l'orologio oltre.
          vi.setSystemTime(Date.now() + 120_000);
        }
        const current = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        if (current.phase === "metrics" || current.phase === "store") {
          expect(await duplicateSuggestionPairs(job.id)).toBe(0);
        }
      }

      expect(failures).toBe(1);
      const finished = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(finished.status).toBe("completed");
      expect(await snapshotRows(sectionId)).toEqual(expected);
    });
  }
});

describe("lease occupato", () => {
  // covers: AC-1202-3
  it("con locked_until 60 s nel futuro ritorna lease_busy senza toccare la riga", async () => {
    const { projectId, sectionId } = await createSection(SEEDS);
    const { job } = await enqueueExtractionJob(projectId, sectionId);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "running",
        phase: "autocomplete",
        cursor: { queries: ["caffè moka"], failedQueries: 0 },
        progress_done: 4,
        progress_total: 20,
        locked_until: new Date(Date.now() + 60_000),
      },
    });
    const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });

    const result = await advanceJob(job.id, Date.now() + 10_000);

    expect(result.skipped).toBe("lease_busy");
    expect(result.more).toBe(false);
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.cursor).toEqual(before.cursor);
    expect(after.progress_done).toBe(before.progress_done);
    expect(after.phase).toBe(before.phase);
    expect(after.locked_until).toEqual(before.locked_until);
  });
});

describe("annullamento richiesto", () => {
  // covers: AC-1202-4
  it("il job in fase autocomplete diventa canceled, lo staging sparisce e le 5 candidate restano", async () => {
    const { projectId, sectionId } = await createSection(SEEDS);
    await prisma.keywordCandidate.createMany({
      data: ["uno", "due", "tre", "quattro", "cinque"].map((keyword) => ({
        project_id: projectId,
        subproject_id: sectionId,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: keyword,
      })),
    });
    const { job } = await enqueueExtractionJob(projectId, sectionId);
    // Un batch per chiamata: expand, poi un batch di autocomplete che scrive lo staging.
    await advanceJob(job.id, Date.now());
    await advanceJob(job.id, Date.now());
    await prisma.jobMetric.create({
      data: { job_id: job.id, canonical_keyword: "caffe moka", metrics_status: "mock", metrics_provider: "MOCK" },
    });
    const running = await prisma.job.update({ where: { id: job.id }, data: { cancel_requested: true } });
    expect(running.phase).toBe("autocomplete");
    expect(await prisma.jobSuggestion.count({ where: { job_id: job.id } })).toBeGreaterThan(0);

    await advanceJob(job.id, Date.now() + 10_000);

    const canceled = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(canceled.status).toBe("canceled");
    expect(canceled.completed_at).not.toBeNull();
    expect(await prisma.jobSuggestion.count({ where: { job_id: job.id } })).toBe(0);
    expect(await prisma.jobMetric.count({ where: { job_id: job.id } })).toBe(0);
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: sectionId } })).toBe(5);
  });
});
