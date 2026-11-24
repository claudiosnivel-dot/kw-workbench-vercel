// Gate di T-8301 (AC-8301-1…3, D-71): Claude Code crea un altro argomento di un progetto con create_topic, con le sue
// parole di partenza e la sua ricerca (origin AGENT), come «+ Nuovo argomento» dell'app: le keyword degli altri argomenti
// non cambiano, un nome già usato è SECTION_NAME_TAKEN e al tetto di spesa l'argomento non nasce. Il piano usa le keyword
// tenute di tutti gli argomenti. Autocomplete simulato, risultati di Google già salvati e DataForSEO finto: nessuna
// chiamata reale.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { waitClock } from "@/lib/modules/agent/wait";
import { runJobById } from "@/lib/modules/jobs/job-runner";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey } from "../helpers/mcp";
import { finishPlanRun, noVolumesResponse, VOLUMES_URL_PART } from "../helpers/plan-run";
import { MAGNETOTHERAPY_SERP_FIXTURE } from "../helpers/strategy";

// Ricerche e lavori di piano non partono in background: i test li portano in fondo quando serve.
vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleJobContinuation: vi.fn(),
  schedulePlanRunContinuation: vi.fn(),
}));

// Autocomplete simulato: un suggerimento per query.
vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) => [{ keyword: `${query} prezzi`, source: "mock-autocomplete", sourceQuery: query }],
  }),
}));

/** DataForSEO finto: nessun volume per le keyword chieste, nient'altro (i risultati di Google sono già salvati). */
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
  String(input).includes(VOLUMES_URL_PART) ? noVolumesResponse(init) : new Response("{}", { status: 404 })
);

const FIXTURE = MAGNETOTHERAPY_SERP_FIXTURE;
const canonical = (text: string) => canonicalizeKeyword(text, "it");

type Root = Awaited<ReturnType<typeof rootAdminWithKey>>;
type Created = { projectId: string; topicId: string; jobId: string | null; extraction: string; spend: { spentTodayUsd: number; capUsd: number } };

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

beforeEach(async () => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("JOB_MAX_ATTEMPTS", "5");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_COST_PER_REQUEST_USD", "0.09");
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
  resetEnvForTests();
  resetDataForSeoLimiterForTests();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * wait_for_job con l'orologio dell'attesa finto: a ogni attesa la ricerca fa i suoi passi come farebbe la continuazione,
 * quindi la risposta arriva a ricerca finita.
 */
async function waitForSearch(root: Root, jobId: string) {
  let elapsed = 0;
  const now = vi.spyOn(waitClock, "now").mockImplementation(() => elapsed);
  const sleep = vi.spyOn(waitClock, "sleep").mockImplementation(async (ms) => {
    elapsed += ms;
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (ACTIVE_JOB_STATUSES.includes(job.status)) await runJobById(jobId);
  });
  const waited = await callTool(root.key, "wait_for_job", { jobId });
  now.mockRestore();
  sleep.mockRestore();
  return waited;
}

/**
 * Progetto it-IT creato da Claude Code con create_project e l'argomento «Permessi»; senza volumi (fornitore NONE) per non
 * chiamare DataForSEO. Con finish la ricerca del primo argomento arriva in fondo con wait_for_job.
 */
async function agentProject(root: Root, finish: boolean) {
  const { result, data } = await callTool(root.key, "create_project", { name: "Consulente del lavoro", languageCode: "it", countryCode: "IT", seeds: ["permessi"] });
  expect(result?.isError).not.toBe(true);
  const created = data as unknown as Created;
  expect(created.extraction).toBe("started");
  await prisma.project.update({ where: { id: created.projectId }, data: { metrics_provider: "NONE" } });
  if (finish) {
    const waited = await waitForSearch(root, created.jobId!);
    expect(waited.data).toMatchObject({ status: "completed", finished: true });
  }
  return created;
}

/** Keyword di un argomento con il loro stato di revisione, nell'ordine degli id. */
const topicKeywords = (topicId: string) =>
  prisma.keywordCandidate.findMany({
    where: { subproject_id: topicId },
    orderBy: { id: "asc" },
    select: { id: true, keyword: true, review_status: true, avg_monthly_searches: true },
  });

describe("create_topic del server MCP", () => {
  // covers: AC-8301-1
  it("crea «Straordinari» in seconda posizione con la sua ricerca AGENT e lascia uguali le keyword di «Permessi»", async () => {
    const root = await rootAdminWithKey("t8301-topic");
    const first = await agentProject(root, true);
    const before = await topicKeywords(first.topicId);
    const keptBefore = await prisma.keywordCandidate.count({ where: { subproject_id: first.topicId, ...KEPT_WHERE } });
    expect(keptBefore).toBeGreaterThan(0);

    const { result, data } = await callTool(root.key, "create_topic", { projectId: first.projectId, name: "Straordinari", seeds: ["straordinari"] });

    expect(result?.isError).not.toBe(true);
    const created = data as unknown as Created;
    expect(created).toMatchObject({ projectId: first.projectId, extraction: "started", spend: { spentTodayUsd: 0, capUsd: 2 } });
    expect(created.topicId).toEqual(expect.any(String));
    expect(created.jobId).toEqual(expect.any(String));
    const waited = await waitForSearch(root, created.jobId!);
    expect(waited.data).toMatchObject({ jobId: created.jobId, topicId: created.topicId, status: "completed", finished: true });

    const topics = await prisma.subproject.findMany({
      where: { project_id: first.projectId },
      orderBy: { position: "asc" },
      select: { id: true, name: true, position: true, seeds: { select: { keyword: true } } },
    });
    expect(topics).toEqual([
      { id: first.topicId, name: "Permessi", position: 0, seeds: [{ keyword: "permessi" }] },
      { id: created.topicId, name: "Straordinari", position: 1, seeds: [{ keyword: "straordinari" }] },
    ]);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: created.jobId! } });
    expect(job).toMatchObject({ project_id: first.projectId, subproject_id: created.topicId, origin: "AGENT", status: "completed" });
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: created.topicId, ...KEPT_WHERE } })).toBeGreaterThan(0);
    // Le keyword di «Permessi» sono le stesse di prima, con lo stesso stato.
    expect(await topicKeywords(first.topicId)).toEqual(before);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: first.projectId } });
    expect(project.default_subproject_id).toBe(first.topicId);
    const call = await prisma.agentCall.findFirstOrThrow({ where: { tool: "create_topic" } });
    expect(call).toMatchObject({ ok: true, project_id: first.projectId });
  });

  // covers: AC-8301-2
  it("un nome già usato è SECTION_NAME_TAKEN e con la spesa al tetto AGENT_SPEND_CAP: il progetto ha ancora un solo argomento", async () => {
    const root = await rootAdminWithKey("t8301-refused");
    const first = await agentProject(root, false);

    const taken = await callTool(root.key, "create_topic", { projectId: first.projectId, name: "Permessi", seeds: ["permessi 104"] });
    // Spesa di oggi uguale al tetto di default (2 $).
    await prisma.metricsProviderRequest.create({
      data: { provider: "DATAFORSEO", project_id: first.projectId, keyword_count: 100, estimated_cost_usd: 2, agent: true },
    });
    const capped = await callTool(root.key, "create_topic", { projectId: first.projectId, name: "TFR", seeds: ["tfr"] });

    expect(taken.result?.isError).toBe(true);
    expect(taken.data).toMatchObject({ code: "SECTION_NAME_TAKEN" });
    expect(capped.result?.isError).toBe(true);
    expect(capped.data).toMatchObject({ code: "AGENT_SPEND_CAP", spentTodayUsd: 2, capUsd: 2 });
    expect(await prisma.subproject.count({ where: { project_id: first.projectId } })).toBe(1);
    expect(await prisma.seed.count({ where: { project_id: first.projectId } })).toBe(1);
    expect(await prisma.job.count({ where: { project_id: first.projectId } })).toBe(1);
  });

  it("un progetto di un altro workspace è PROJECT_NOT_FOUND e un nome di soli spazi VALIDATION_ERROR, senza argomenti nuovi", async () => {
    const root = await rootAdminWithKey("t8301-foreign");
    const owner = await createUserWithSession({ displayName: "t8301-proprietario" });
    const foreign = await prisma.project.create({ data: { name: "Altro sito", workspace_id: owner.workspaceId } });
    const first = await agentProject(root, false);

    const other = await callTool(root.key, "create_topic", { projectId: foreign.id, name: "Straordinari", seeds: ["straordinari"] });
    const blank = await callTool(root.key, "create_topic", { projectId: first.projectId, name: "   ", seeds: ["straordinari"] });

    expect(other.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(blank.data).toMatchObject({ code: "VALIDATION_ERROR", field: "name" });
    expect(await prisma.subproject.count({ where: { project_id: foreign.id } })).toBe(0);
    expect(await prisma.subproject.count({ where: { project_id: first.projectId } })).toBe(1);
  });
});

describe("piano di un progetto con più argomenti", () => {
  // covers: AC-8301-3
  it("build_plan e get_plan usano le keyword tenute di entrambi gli argomenti", async () => {
    const root = await rootAdminWithKey("t8301-plan");
    const project = await prisma.project.create({
      data: { name: "Noleggio magnetoterapia", workspace_id: root.workspaceId, language_code: "it", country_code: "IT" },
    });
    // Le keyword della fixture divise fra due argomenti, una sì e una no, con i risultati di Google salvati da poco.
    const halves = [FIXTURE.keywords.filter((_, index) => index % 2 === 0), FIXTURE.keywords.filter((_, index) => index % 2 === 1)];
    for (const [position, keywords] of halves.entries()) {
      const topic = await prisma.subproject.create({ data: { project_id: project.id, name: `Argomento ${position + 1}`, position } });
      await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: keywords[0].keyword } });
      await prisma.keywordCandidate.createMany({
        data: keywords.map((keyword) => ({
          project_id: project.id,
          subproject_id: topic.id,
          keyword: keyword.keyword,
          normalized_keyword: keyword.keyword,
          canonical_keyword: canonical(keyword.keyword),
          source: "seed" as const,
          source_query: keywords[0].keyword,
          score: keyword.score ?? 50,
          avg_monthly_searches: keyword.volume,
          is_question: keyword.isQuestion ?? false,
        })),
      });
    }
    await prisma.keywordSerp.createMany({
      data: FIXTURE.keywords.map((keyword) => ({ language_code: "it", country_code: "IT", canonical_keyword: canonical(keyword.keyword), urls: keyword.urls })),
    });

    const started = await callTool(root.key, "build_plan", { projectId: project.id });
    expect(started.result?.isError).not.toBe(true);
    const run = await finishPlanRun((started.data as { runId: string }).runId);
    expect(run).toMatchObject({ origin: "AGENT", status: "completed" });
    const plan = await callTool(root.key, "get_plan", { projectId: project.id });
    expect(plan.result?.isError).not.toBe(true);

    const reply = plan.data as unknown as { pages: { keywords: { keyword: string }[] }[]; unassigned: { keyword: string }[]; nextCursor: string | null };
    expect(reply.nextCursor).toBeNull();
    const inPlan = new Set([...reply.pages.flatMap((page) => page.keywords), ...reply.unassigned].map((keyword) => canonical(keyword.keyword)));
    for (const keywords of halves) {
      expect(keywords.some((keyword) => inPlan.has(canonical(keyword.keyword)))).toBe(true);
    }
    expect(inPlan.size).toBe(FIXTURE.keywords.length);
  });
});
