// Gate di T-7501 (AC-7501-1…3, D-64): Claude Code costruisce il piano con build_plan e lo aspetta con wait_for_job; il
// lavoro ha origin AGENT, non chiede nulla alle AI di Titan SEO (nessuna riga di ai_requests della funzione plan, nessun
// consiglio sugli angoli), le sue richieste a DataForSEO contano per il tetto di Claude Code e il piano ha grouping_notice
// AGENT_PLAN; un lavoro dell'app sullo stesso progetto usa invece l'AI. get_plan dà il piano corrente nell'ordine di
// lavoro. DataForSEO e OpenRouter sono simulati con i dati della fixture it-magnetoterapia-serp.json: nessuna chiamata
// reale.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { resetEnvForTests } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma/client";
import { waitClock } from "@/lib/modules/agent/wait";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { prisma } from "@/lib/prisma";
import { saveAiSettings, stubOpenRouterEnv } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { callTool, rootAdminWithKey } from "../helpers/mcp";
import { finishPlanRun, noVolumesResponse, VOLUMES_URL_PART } from "../helpers/plan-run";
import { insertStrategy, MAGNETOTHERAPY_SERP_FIXTURE } from "../helpers/strategy";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  schedulePlanRunContinuation: vi.fn(),
}));

const FIXTURE = MAGNETOTHERAPY_SERP_FIXTURE;
const canonical = (text: string) => canonicalizeKeyword(text, "it");
const urlsOf = new Map(FIXTURE.keywords.map((keyword) => [keyword.keyword, keyword.urls]));
const classOf = new Map(FIXTURE.keywords.map((keyword) => [canonical(keyword.keyword), keyword.class]));

/** Task dei risultati di Google creati dal finto DataForSEO: keyword per id. */
const serpTasks = new Map<string, string>();

const json = (body: unknown) => Response.json(body);

/** OpenRouter finto: classifica le keyword ricevute con le classi della fixture. */
function openRouterAnswer(init: RequestInit | undefined): Response {
  const request = JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] };
  const sent = JSON.parse(request.messages.find((message) => message.role === "user")!.content) as { keywords?: string[] };
  const classes: Record<string, string> = {};
  for (const keyword of sent.keywords ?? []) {
    const found = classOf.get(keyword);
    if (found && found !== "other") classes[keyword] = found;
  }
  return json({ model: request.model, choices: [{ message: { content: JSON.stringify(classes) } }] });
}

/** DataForSEO finto: i task dei risultati di Google sono pronti subito, con gli URL della fixture. */
function serpAnswer(url: string, init: RequestInit | undefined): Response | null {
  if (url.endsWith("/task_post")) {
    const ids = (JSON.parse(String(init?.body)) as { keyword: string }[]).map((task) => {
      const id = `t7501-${serpTasks.size}`;
      serpTasks.set(id, task.keyword);
      return id;
    });
    return json({ status_code: 20000, cost: 0.0012 * ids.length, tasks: ids.map((id) => ({ id, status_code: 20100, cost: 0.0012, result: null })) });
  }
  if (url.endsWith("/tasks_ready")) {
    return json({ status_code: 20000, cost: 0, tasks: [{ id: "ready", status_code: 20000, cost: 0, result: [...serpTasks.keys()].map((id) => ({ id })) }] });
  }
  const id = /\/task_get\/regular\/([^/?]+)$/.exec(url)?.[1];
  const keyword = id ? serpTasks.get(id) : undefined;
  if (!id || keyword === undefined) return null;
  const items = (urlsOf.get(keyword) ?? []).map((link, index) => ({ type: "organic", rank_absolute: index + 1, url: link }));
  return json({ status_code: 20000, cost: 0, tasks: [{ id, status_code: 20000, cost: 0, result: [{ keyword, items }] }] });
}

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://openrouter.test/")) return openRouterAnswer(init);
  if (url.includes("/v3/serp/google/organic/")) return serpAnswer(url, init) ?? new Response("{}", { status: 404 });
  if (url.includes(VOLUMES_URL_PART)) return noVolumesResponse(init);
  return new Response("{}", { status: 404 });
});

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
  stubOpenRouterEnv();
  resetEnvForTests();
  resetDataForSeoLimiterForTests();
  await saveAiSettings({ models: ["autore/primo:free", "autore/secondo:free"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  vi.mocked(schedulePlanRunContinuation).mockClear();
  serpTasks.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Root = Awaited<ReturnType<typeof rootAdminWithKey>>;

/** Progetto it-IT del root admin con le keyword tenute della fixture e i loro volumi. */
async function fixtureProject(root: Root) {
  const project = await prisma.project.create({
    data: { name: "Noleggio magnetoterapia", workspace_id: root.workspaceId, language_code: "it", country_code: "IT" },
  });
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: FIXTURE.seeds[0] } });
  await prisma.keywordCandidate.createMany({
    data: FIXTURE.keywords.map((keyword) => ({
      project_id: project.id,
      subproject_id: topic.id,
      keyword: keyword.keyword,
      normalized_keyword: keyword.keyword,
      canonical_keyword: canonical(keyword.keyword),
      source: "seed",
      source_query: FIXTURE.seeds[0],
      score: keyword.score ?? 50,
      avg_monthly_searches: keyword.volume,
      is_question: keyword.isQuestion ?? false,
    })),
  });
  return project.id;
}

type Started = { runId: string; regenerate: boolean; spend: { spentTodayUsd: number; capUsd: number } };
type Waited = { runId: string; status: string; phase: string; finished: boolean; strategyId?: string };

/**
 * build_plan e poi wait_for_job finché il lavoro non è finito, con l'orologio dell'attesa finto: ogni attesa porta in
 * fondo il lavoro con i passi del motore, come farebbe la continuazione.
 */
async function agentPlan(root: Root, projectId: string) {
  const started = await callTool(root.key, "build_plan", { projectId });
  expect(started.result?.isError).not.toBe(true);
  const { runId } = started.data as unknown as Started;
  let elapsed = 0;
  vi.spyOn(waitClock, "now").mockImplementation(() => elapsed);
  vi.spyOn(waitClock, "sleep").mockImplementation(async (ms) => {
    elapsed += ms;
    await finishPlanRun(runId);
  });
  const waited = await callTool(root.key, "wait_for_job", { runId });
  expect(waited.result?.isError).not.toBe(true);
  return { started: started.data as unknown as Started, waited: waited.data as unknown as Waited, run: await prisma.planRun.findUniqueOrThrow({ where: { id: runId } }) };
}

const planAiRequests = () => prisma.aiRequest.count({ where: { feature: "plan" } });
const openRouterCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://openrouter.test/")).length;

describe("build_plan del server MCP", () => {
  // covers: AC-7501-1
  it("il lavoro ha origin AGENT, nessuna richiesta all'AI, grouping_notice AGENT_PLAN, nessun consiglio e spesa di Claude Code", async () => {
    const root = await rootAdminWithKey("t7501-agent");
    const projectId = await fixtureProject(root);

    const { started, waited, run } = await agentPlan(root, projectId);

    expect(started).toMatchObject({ regenerate: false, spend: { spentTodayUsd: 0, capUsd: 2 } });
    expect(run).toMatchObject({ origin: "AGENT", status: "completed", phase: "done" });
    expect(waited).toMatchObject({ runId: run.id, status: "completed", finished: true, strategyId: run.strategy_id });
    expect(schedulePlanRunContinuation).toHaveBeenCalledWith(run.id);

    expect(await planAiRequests()).toBe(0);
    expect(openRouterCalls()).toBe(0);
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } });
    expect(strategy).toMatchObject({ project_id: projectId, grouping_source: "SERP", grouping_notice: "AGENT_PLAN" });
    expect(await prisma.strategyKeyword.count({ where: { strategy_id: strategy.id, NOT: { angle_advice: { equals: Prisma.DbNull } } } })).toBe(0);
    expect(await prisma.strategyKeyword.count({ where: { strategy_id: strategy.id, angle: true } })).toBe(0);

    // Le richieste a DataForSEO del lavoro (risultati di Google) sono di Claude Code.
    const requests = await prisma.metricsProviderRequest.findMany({ where: { job_id: run.id }, select: { agent: true } });
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.agent)).toBe(true);
    const call = await prisma.agentCall.findFirstOrThrow({ where: { tool: "build_plan" } });
    expect(call).toMatchObject({ ok: true, project_id: projectId });
  });

  // covers: AC-7501-2
  it("un lavoro dell'app sullo stesso progetto usa l'AI e non ha AGENT_PLAN; quello di Claude Code dopo no", async () => {
    const root = await rootAdminWithKey("t7501-app");
    const projectId = await fixtureProject(root);

    const response = await callRoute(createStrategy, {
      method: "POST",
      url: `/api/projects/${projectId}/strategies`,
      cookie: root.cookie,
      params: { id: projectId },
      body: { mode: "AUTO" },
    });
    expect(response.status).toBe(202);
    const appRun = await finishPlanRun(((await response.json()) as { data: { runId: string } }).data.runId);
    const appRequests = await planAiRequests();

    expect(appRun).toMatchObject({ origin: "APP", status: "completed" });
    expect(appRequests).toBeGreaterThan(0);
    const appStrategy = await prisma.strategy.findUniqueOrThrow({ where: { id: appRun.strategy_id! } });
    expect(appStrategy.grouping_source).toBe("SERP");
    expect(appStrategy.grouping_notice).not.toBe("AGENT_PLAN");
    const appSpend = await prisma.metricsProviderRequest.findMany({ where: { job_id: appRun.id }, select: { agent: true } });
    expect(appSpend.length).toBeGreaterThan(0);
    expect(appSpend.some((request) => request.agent)).toBe(false);

    const { started, run } = await agentPlan(root, projectId);

    expect(started.regenerate).toBe(true);
    expect(run).toMatchObject({ origin: "AGENT", status: "completed" });
    expect(await planAiRequests()).toBe(appRequests);
    const agentStrategy = await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } });
    expect(agentStrategy.id).not.toBe(appStrategy.id);
    expect(agentStrategy.grouping_notice).toBe("AGENT_PLAN");
  });

  it("con un lavoro di piano attivo risponde JOB_ALREADY_ACTIVE con il suo runId; il progetto di altri è PROJECT_NOT_FOUND", async () => {
    const root = await rootAdminWithKey("t7501-active");
    const projectId = await fixtureProject(root);
    const owner = await createUserWithSession({ displayName: "t7501-owner" });
    const foreign = await prisma.project.create({ data: { name: "Altro", workspace_id: owner.workspaceId } });
    const first = await callTool(root.key, "build_plan", { projectId });

    const second = await callTool(root.key, "build_plan", { projectId });
    const denied = await callTool(root.key, "build_plan", { projectId: foreign.id });

    expect(second.result?.isError).toBe(true);
    expect(second.data).toMatchObject({ code: "JOB_ALREADY_ACTIVE", runId: (first.data as { runId: string }).runId });
    expect(denied.result?.isError).toBe(true);
    expect(denied.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(await prisma.planRun.count()).toBe(1);
  });
});

describe("get_plan del server MCP", () => {
  // covers: AC-7501-3
  it("dà la version, le quattro pagine nell'ordine di lavoro con titoli, stato e keyword, e le due non assegnate", async () => {
    const root = await rootAdminWithKey("t7501-read");
    const project = await prisma.project.create({ data: { name: "Magnetoterapia", workspace_id: root.workspaceId } });
    const cities = Array.from({ length: 15 }, (_, index) => ({ text: `magnetoterapia città ${index + 1}`, volume: 10 }));
    const plan = await insertStrategy({
      projectId: project.id,
      version: 7,
      pages: [
        { key: "hub", kind: "HUB", keywords: [{ text: "noleggio magnetoterapia", volume: 900 }], h1: "Noleggio magnetoterapia", h2: ["Come funziona"] },
        {
          key: "costo",
          kind: "SPOKE",
          hub: "hub",
          keywords: [
            { text: "noleggio magnetoterapia costo", volume: 200 },
            { text: "noleggio magnetoterapia prezzi", volume: 90 },
          ],
          status: "WRITING",
        },
        { key: "farmacia", kind: "SPOKE", hub: "hub", keywords: [{ text: "magnetoterapia farmacia", volume: 70 }], status: "PUBLISHED" },
        { key: "locale", kind: "SPOKE", hub: "hub", keywords: cities, contentType: "local" },
      ],
      unassigned: [
        { text: "magnetoterapia fai da te", volume: 30 },
        { text: "magnetoterapia opinioni", volume: null },
      ],
    });
    await prisma.strategy.update({ where: { id: plan.strategyId }, data: { grouping_source: "SERP", grouping_notice: "AGENT_PLAN" } });

    const { result, data } = await callTool(root.key, "get_plan", { projectId: project.id });

    expect(result?.isError).not.toBe(true);
    const read = data as unknown as {
      strategyId: string;
      version: number;
      groupingSource: string;
      groupingNotice: string;
      pages: { id: string; number: number; kind: string; hubPageId: string | null; h1: string; h2: string[]; status: string; contentType: string; cities?: number; keywords: { id: string; keyword: string; volume: number | null; role: string; angle: boolean }[] }[];
      unassigned: { id: string; keyword: string; volume: number | null }[];
    };
    expect(read).toMatchObject({ strategyId: plan.strategyId, version: 7, groupingSource: "SERP", groupingNotice: "AGENT_PLAN" });
    expect(read.pages.map(({ id, number, kind, hubPageId, status }) => ({ id, number, kind, hubPageId, status }))).toEqual([
      { id: plan.pageIds.hub, number: 1, kind: "HUB", hubPageId: null, status: "TODO" },
      { id: plan.pageIds.costo, number: 2, kind: "SPOKE", hubPageId: plan.pageIds.hub, status: "WRITING" },
      { id: plan.pageIds.farmacia, number: 3, kind: "SPOKE", hubPageId: plan.pageIds.hub, status: "PUBLISHED" },
      { id: plan.pageIds.locale, number: 4, kind: "SPOKE", hubPageId: plan.pageIds.hub, status: "TODO" },
    ]);
    expect(read.pages[0]).toMatchObject({ h1: "Noleggio magnetoterapia", h2: ["Come funziona"], contentType: "guide" });
    expect(read.pages[1].keywords).toEqual([
      expect.objectContaining({ id: plan.keywordIds["noleggio magnetoterapia costo"], keyword: "noleggio magnetoterapia costo", volume: 200, role: "MAIN", angle: false }),
      expect.objectContaining({ id: plan.keywordIds["noleggio magnetoterapia prezzi"], keyword: "noleggio magnetoterapia prezzi", volume: 90, role: "SECONDARY" }),
    ]);
    expect(read.pages[3]).toMatchObject({ contentType: "local", cities: 15 });
    expect(read.pages.slice(0, 3).every((page) => page.cities === undefined)).toBe(true);
    expect(read.unassigned).toEqual([
      expect.objectContaining({ id: plan.keywordIds["magnetoterapia fai da te"], keyword: "magnetoterapia fai da te", volume: 30 }),
      expect.objectContaining({ id: plan.keywordIds["magnetoterapia opinioni"], keyword: "magnetoterapia opinioni", volume: null }),
    ]);
  });

  it("senza piano risponde STRATEGY_NOT_FOUND; il piano di un progetto di altri è PROJECT_NOT_FOUND", async () => {
    const root = await rootAdminWithKey("t7501-none");
    const project = await prisma.project.create({ data: { name: "Vuoto", workspace_id: root.workspaceId } });
    const owner = await createUserWithSession({ displayName: "t7501-none-owner" });
    const foreign = await prisma.project.create({ data: { name: "Altro", workspace_id: owner.workspaceId } });
    await insertStrategy({ projectId: foreign.id, pages: [{ key: "hub", kind: "HUB", keywords: [{ text: "magnetoterapia", volume: 10 }] }] });

    const none = await callTool(root.key, "get_plan", { projectId: project.id });
    const denied = await callTool(root.key, "get_plan", { projectId: foreign.id });

    expect(none.result?.isError).toBe(true);
    expect(none.data).toMatchObject({ code: "STRATEGY_NOT_FOUND" });
    expect(denied.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});
