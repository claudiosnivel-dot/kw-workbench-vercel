// Gate di T-6201 (AC-6201-1…AC-6201-4, D-57) e di T-6202 (AC-6202-3): «Costruisci il piano» avvia un lavoro di piano
// che chiede volumi e risultati di Google a DataForSEO (simulato, nessuna chiamata reale), raggruppa con il motore di
// oggi e salva la strategia; senza i dati con licenza il piano esce lo stesso con l'avviso; un solo lavoro attivo per
// progetto; il cron reap-jobs riprende un lavoro fermo dalla sua fase; lo stato si legge solo dal proprio progetto. In
// più la raccolta oltre i 10 minuti (SERP_TIMEOUT) e il tetto dei tentativi. La continuazione è sostituita da un
// registratore: nessuna chiamata HTTP verso le rotte interne.
// impacted-by: T-6303 (con i risultati di Google per almeno metà delle keyword la strategia ha grouping_source SERP; in
// AC-6201-1 l'AI è attiva con OpenRouter simulato, così luoghi e concorrenti non lasciano il motivo AI_NOT_CONFIGURED)
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as reapJobsCron } from "@/app/api/cron/reap-jobs/route";
import { GET as readActiveRoute } from "@/app/api/projects/[id]/plan-runs/active/route";
import { GET as readRunRoute } from "@/app/api/projects/[id]/plan-runs/[runId]/route";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { resetEnvForTests } from "@/lib/env";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { advancePlanRun, runPlanStep } from "@/lib/modules/plan-runs/run";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { saveAiSettings, stubOpenRouterEnv } from "../helpers/ai-titles";
import { callRoute } from "../helpers/http";
import { finishPlanRun } from "../helpers/plan-run";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  schedulePlanRunContinuation: vi.fn(),
}));

const registrar = vi.mocked(schedulePlanRunContinuation);
const CRON_SECRET = randomBytes(24).toString("hex");

const KEYWORDS = [
  "noleggio magnetoterapia",
  "noleggio magnetoterapia costo",
  "noleggio magnetoterapia milano",
  "magnetoterapia a casa",
  "magnetoterapia prezzi",
  "apparecchio magnetoterapia",
];

const api = vi.hoisted(() => ({
  /** Keyword di ogni task dei risultati di Google creato, per id. */
  tasks: new Map<string, string>(),
  /** I task dei risultati di Google sono pronti alla raccolta. */
  ready: true,
}));

/** DataForSEO simulato: volumi (search_volume/live) e risultati di Google in coda priority (task_post, tasks_ready, task_get). */
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://openrouter.test/")) {
    // OpenRouter simulato: nessun luogo e nessun concorrente fra le keyword inviate.
    return Response.json({ model: "autore/modello-prova:free", choices: [{ message: { content: "{}" } }] });
  }
  if (url.includes("/keywords_data/google_ads/search_volume/live")) {
    const [task] = JSON.parse(String(init?.body)) as { keywords: string[] }[];
    const result = task.keywords.map((keyword, index) => ({ keyword, spell: null, search_volume: 100 + index * 10, competition_index: 30 }));
    return Response.json({ status_code: 20000, cost: 0.09, tasks: [{ id: "volumes", status_code: 20000, cost: 0.09, result }] });
  }
  if (url.endsWith("/v3/serp/google/organic/task_post")) {
    const posted = JSON.parse(String(init?.body)) as { keyword: string }[];
    const tasks = posted.map((task, index) => {
      const id = `serp-${api.tasks.size + index}`;
      return { id, keyword: task.keyword };
    });
    for (const task of tasks) api.tasks.set(task.id, task.keyword);
    return Response.json({ status_code: 20000, cost: 0.0012 * tasks.length, tasks: tasks.map(({ id }) => ({ id, status_code: 20100, cost: 0.0012, result: null })) });
  }
  if (url.endsWith("/v3/serp/google/organic/tasks_ready")) {
    const result = api.ready ? [...api.tasks.keys()].map((id) => ({ id })) : [];
    return Response.json({ status_code: 20000, cost: 0, tasks: [{ id: "ready", status_code: 20000, cost: 0, result }] });
  }
  const id = url.match(/\/task_get\/regular\/([^/?]+)$/)?.[1];
  if (id && api.tasks.has(id)) {
    const items = [1, 2, 3].map((rank) => ({ type: "organic", rank_absolute: rank, url: `https://sito-${rank}.example/${id}` }));
    return Response.json({ status_code: 20000, cost: 0, tasks: [{ id, status_code: 20000, cost: 0, result: [{ keyword: api.tasks.get(id), items }] }] });
  }
  return new Response("{}", { status: 404 });
});

beforeAll(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("JOB_MAX_ATTEMPTS", "5");
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_COST_PER_REQUEST_USD", "0.09");
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  stubOpenRouterEnv();
  resetEnvForTests();
  resetDataForSeoLimiterForTests();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  registrar.mockClear();
  api.tasks.clear();
  api.ready = true;
});

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

/** Progetto it-IT del workspace personale dell'utente con le keyword tenute indicate, senza volume. */
async function projectWithKeywords(session: Session, keywords: string[] = KEYWORDS) {
  const project = await prisma.project.create({
    data: { name: "Magnetoterapia", workspace_id: session.workspaceId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.keywordCandidate.createMany({
    data: keywords.map((keyword) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
      score: 40,
    })),
  });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "noleggio magnetoterapia" } });
  return project.id;
}

const postPlan = (session: Session, projectId: string, body: unknown = { mode: "AUTO" }) =>
  callRoute(createStrategy, { method: "POST", url: `/api/projects/${projectId}/strategies`, cookie: session.cookie, params: { id: projectId }, body });

async function startedRun(session: Session, projectId: string): Promise<string> {
  const response = await postPlan(session, projectId);
  expect(response.status).toBe(202);
  return ((await response.json()) as { data: { runId: string } }).data.runId;
}

const callCron = () => callRoute(reapJobsCron, { url: "/api/cron/reap-jobs", headers: { authorization: `Bearer ${CRON_SECRET}` } });

const runRow = (id: string) => prisma.planRun.findUniqueOrThrow({ where: { id } });

describe("lavoro di piano", () => {
  // covers: AC-6201-1
  it("per il root admin chiede volumi e risultati di Google, salva la strategia e chiude il lavoro senza avviso", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithKeywords(admin);
    await saveAiSettings();

    const runId = await startedRun(admin, projectId);

    expect(registrar.mock.calls).toEqual([[runId]]);
    expect(await runRow(runId)).toMatchObject({ status: "pending", phase: "volumes", project_id: projectId, requested_by: admin.user.id });
    const run = await finishPlanRun(runId);
    expect(run).toMatchObject({ status: "completed", phase: "done", locked_until: null, notice: null, error_code: null });
    expect(run.strategy_id).not.toBeNull();
    const keywords = await prisma.keywordCandidate.findMany({ where: { project_id: projectId } });
    expect(keywords.map((row) => typeof row.avg_monthly_searches)).toEqual(KEYWORDS.map(() => "number"));
    expect(await prisma.keywordSerp.count()).toBe(6);
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } });
    expect(strategy).toMatchObject({ project_id: projectId, grouping_source: "SERP", grouping_notice: null, considered_count: 6 });
    expect((await prisma.strategyKeyword.findMany({ where: { strategy_id: strategy.id } })).every((row) => row.volume !== null)).toBe(true);
  });

  // covers: AC-6201-2
  it("per un MEMBER senza dati con licenza non chiama DataForSEO e salva il piano del motore con PLAN_NO_LICENSED_METRICS", async () => {
    const owner = await createUserWithSession();
    const member = await createUserWithSession();
    await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: member.user.id, role: "MEMBER" } });
    const projectId = await projectWithKeywords(owner);

    const run = await finishPlanRun(await startedRun(member, projectId));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(run).toMatchObject({ status: "completed", notice: "PLAN_NO_LICENSED_METRICS" });
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } });
    expect(strategy).toMatchObject({ grouping_source: "ENGINE", grouping_notice: "PLAN_NO_LICENSED_METRICS", created_by_user_id: member.user.id });
  });

  // covers: AC-6201-3
  it("con un lavoro attivo nel progetto un secondo avvio è 409 JOB_ALREADY_ACTIVE, anche per due avvii insieme", async () => {
    const owner = await createUserWithSession();
    const projectId = await projectWithKeywords(owner);
    const first = await startedRun(owner, projectId);

    const again = await postPlan(owner, projectId);

    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "JOB_ALREADY_ACTIVE", runId: first });
    expect(await prisma.planRun.count({ where: { project_id: projectId, status: { in: ["pending", "running"] } } })).toBe(1);

    const otherProject = await projectWithKeywords(owner);
    const together = await Promise.all([postPlan(owner, otherProject), postPlan(owner, otherProject)]);
    expect(together.map((response) => response.status).sort()).toEqual([202, 409]);
    expect(await prisma.planRun.count({ where: { project_id: otherProject } })).toBe(1);
  });

  // covers: AC-6201-4
  it("il cron riprende dalla sua fase un lavoro fermo, che arriva a completed con la strategia; al tetto dei tentativi è failed", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const stuckId = await startedRun(admin, await projectWithKeywords(admin));
    const exhaustedId = await startedRun(admin, await projectWithKeywords(admin));
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const stuck = { status: "running" as const, locked_until: tenMinutesAgo, heartbeat_at: tenMinutesAgo };
    await prisma.planRun.update({ where: { id: stuckId }, data: { ...stuck, phase: "cluster", attempts: 1 } });
    await prisma.planRun.update({ where: { id: exhaustedId }, data: { ...stuck, attempts: 5 } });
    registrar.mockClear();

    const response = await callCron();

    expect(await response.json()).toEqual({ resumed: 1, failed: 1 });
    expect(registrar.mock.calls).toEqual([[stuckId]]);
    expect(await runRow(stuckId)).toMatchObject({ status: "running", phase: "cluster", attempts: 2 });
    expect(await runRow(exhaustedId)).toMatchObject({ status: "failed", error_code: "INTERNAL_ERROR", strategy_id: null });

    // La continuazione registrata esegue il passo: dalla fase cluster, senza chiedere di nuovo volumi e risultati.
    await runPlanStep(stuckId);
    const resumed = await runRow(stuckId);
    expect(resumed).toMatchObject({ status: "completed", phase: "done" });
    expect(await prisma.strategy.count({ where: { id: resumed.strategy_id! } })).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await (await callCron()).json()).toEqual({ resumed: 0, failed: 0 });
  });

  it("un errore non gestito conta un tentativo e al tetto il lavoro è failed con INTERNAL_ERROR, senza strategia", async () => {
    const owner = await createUserWithSession();
    const projectId = await projectWithKeywords(owner);
    const runId = await startedRun(owner, projectId);
    await prisma.planRun.update({ where: { id: runId }, data: { phase: "sconosciuta", attempts: 3 } });

    await runPlanStep(runId);
    expect(await runRow(runId)).toMatchObject({ status: "running", attempts: 4, locked_until: null });
    await runPlanStep(runId);

    expect(await runRow(runId)).toMatchObject({ status: "failed", attempts: 5, error_code: "INTERNAL_ERROR" });
    expect(await prisma.strategy.count({ where: { project_id: projectId } })).toBe(0);
  });

  it("dopo 10 minuti dall'invio dei task il piano esce con il motore e SERP_TIMEOUT", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const runId = await startedRun(admin, await projectWithKeywords(admin));
    api.ready = false;

    // Con 65 s davanti il passo non ha tempo per attendere la raccolta successiva: si ferma in serps_collect.
    expect(await advancePlanRun(runId, Date.now() + 65_000)).toMatchObject({ phase: "serps_collect", more: true });
    const waiting = await runRow(runId);
    expect(waiting).toMatchObject({ status: "running", locked_until: null, progress_done: 0, progress_total: 6 });
    const cursor = waiting.cursor as { serps: { postedAt: string } };
    cursor.serps.postedAt = new Date(Date.now() - 11 * 60_000).toISOString();
    await prisma.planRun.update({ where: { id: runId }, data: { cursor } });

    const run = await finishPlanRun(runId);

    expect(run).toMatchObject({ status: "completed", notice: "SERP_TIMEOUT", progress_done: 6 });
    expect(await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } })).toMatchObject({ grouping_notice: "SERP_TIMEOUT" });
    expect(await prisma.keywordSerp.count()).toBe(0);
  });
});

describe("stato del lavoro di piano", () => {
  // covers: AC-6202-3
  it("si legge dal proprio progetto; con il runId di un altro progetto la risposta è 404", async () => {
    const owner = await createUserWithSession();
    const projectId = await projectWithKeywords(owner);
    const runId = await startedRun(owner, projectId);
    const stranger = await createUserWithSession();
    const strangerProject = await projectWithKeywords(stranger);
    const read = (session: Session, id: string) =>
      callRoute(readRunRoute, { url: `/api/projects/${id}/plan-runs/${runId}`, cookie: session.cookie, params: { id, runId } });

    const own = await read(owner, projectId);
    const crossed = await read(stranger, strangerProject);
    const outsider = await read(stranger, projectId);
    const active = await callRoute(readActiveRoute, { url: `/api/projects/${projectId}/plan-runs/active`, cookie: owner.cookie, params: { id: projectId } });

    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({
      data: { id: runId, status: "pending", phase: "volumes", progress: { done: 0, total: 0 }, strategyId: null, errorCode: null },
    });
    expect([crossed.status, outsider.status]).toEqual([404, 404]);
    expect(await crossed.json()).toMatchObject({ code: "PLAN_RUN_NOT_FOUND" });
    expect(await active.json()).toMatchObject({ data: { id: runId, status: "pending" } });

    await finishPlanRun(runId);
    const finished = (await (await read(owner, projectId)).json()) as { data: { status: string; strategyId: string | null } };
    expect(finished.data.status).toBe("completed");
    expect(finished.data.strategyId).not.toBeNull();
    const none = await callRoute(readActiveRoute, { url: `/api/projects/${projectId}/plan-runs/active`, cookie: owner.cookie, params: { id: projectId } });
    expect(await none.json()).toEqual({ data: null });
  });
});
