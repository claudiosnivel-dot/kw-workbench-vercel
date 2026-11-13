// Gate di T-6303 (AC-6303-1…AC-6303-3, D-57): il lavoro di piano raggruppa con i risultati di Google quando ci sono
// per almeno metà delle keyword, riconosce luoghi e concorrenti con l'AI (una riga di ai_requests per tentativo, funzione
// plan) e salva la strategia con grouping_source SERP; con l'AI che non risponde restano i riconoscimenti fissi e il
// motivo AI_CLASSIFY_UNAVAILABLE; una regola nuova fuori dai limiti è 400 senza lavoro. DataForSEO e OpenRouter sono
// simulati con i dati della fixture it-magnetoterapia-serp.json: nessuna chiamata reale. In più: pochi risultati di
// Google danno il motore di oggi con SERP_TOO_FEW, senza richieste al modello.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { resetEnvForTests } from "@/lib/env";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { prisma } from "@/lib/prisma";
import { saveAiSettings, stubOpenRouterEnv } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { finishPlanRun } from "../helpers/plan-run";
import { MAGNETOTHERAPY_SERP_FIXTURE } from "../helpers/strategy";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  schedulePlanRunContinuation: vi.fn(),
}));

const FIXTURE = MAGNETOTHERAPY_SERP_FIXTURE;
const canonical = (text: string) => canonicalizeKeyword(text, "it");
const byKeyword = new Map(FIXTURE.keywords.map((keyword) => [keyword.keyword, keyword]));
const classOf = new Map(FIXTURE.keywords.map((keyword) => [canonical(keyword.keyword), keyword.class]));
const CITIES = FIXTURE.keywords.filter((keyword) => keyword.class === "place" && !keyword.keyword.includes("vicino")).map((keyword) => canonical(keyword.keyword));
const COMPETITORS = FIXTURE.keywords.filter((keyword) => keyword.class === "competitor").map((keyword) => canonical(keyword.keyword));

const api = vi.hoisted(() => ({
  /** Keyword di ogni task dei risultati di Google creato, per id. */
  tasks: new Map<string, string>(),
  /** OpenRouter risponde 503 a ogni modello. */
  aiDown: false,
  /** Keyword con risultati di Google: le altre ricevono un elenco vuoto. */
  withResults: null as Set<string> | null,
}));

/** DataForSEO simulato (risultati di Google della fixture) e OpenRouter simulato (classi della fixture). */
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://openrouter.test/")) {
    if (api.aiDown) return new Response("{}", { status: 503 });
    const body = JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] };
    const { keywords } = JSON.parse(body.messages.find((message) => message.role === "user")!.content) as { keywords: string[] };
    const answer = Object.fromEntries(keywords.filter((keyword) => classOf.get(keyword) !== "other").map((keyword) => [keyword, classOf.get(keyword)]));
    return Response.json({ model: body.model, choices: [{ message: { content: JSON.stringify(answer) } }] });
  }
  if (url.endsWith("/v3/serp/google/organic/task_post")) {
    const posted = JSON.parse(String(init?.body)) as { keyword: string }[];
    const tasks = posted.map((task, index) => ({ id: `serp-${api.tasks.size + index}`, keyword: task.keyword }));
    for (const task of tasks) api.tasks.set(task.id, task.keyword);
    return Response.json({ status_code: 20000, cost: 0.0012 * tasks.length, tasks: tasks.map(({ id }) => ({ id, status_code: 20100, cost: 0.0012, result: null })) });
  }
  if (url.endsWith("/v3/serp/google/organic/tasks_ready")) {
    const result = [...api.tasks.keys()].map((id) => ({ id }));
    return Response.json({ status_code: 20000, cost: 0, tasks: [{ id: "ready", status_code: 20000, cost: 0, result }] });
  }
  const id = url.match(/\/task_get\/regular\/([^/?]+)$/)?.[1];
  if (id && api.tasks.has(id)) {
    const keyword = api.tasks.get(id)!;
    const urls = !api.withResults || api.withResults.has(keyword) ? (byKeyword.get(keyword)?.urls ?? []) : [];
    const items = urls.map((link, index) => ({ type: "organic", rank_absolute: index + 1, url: link }));
    return Response.json({ status_code: 20000, cost: 0, tasks: [{ id, status_code: 20000, cost: 0, result: [{ keyword, items }] }] });
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
  api.tasks.clear();
  api.aiDown = false;
  api.withResults = null;
});

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

/** Progetto it-IT del root admin con le keyword tenute della fixture, con i loro volumi, e la sola seed. */
async function fixtureProject(session: Session) {
  const project = await prisma.project.create({
    data: { name: "Noleggio magnetoterapia", workspace_id: session.workspaceId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.keywordCandidate.createMany({
    data: FIXTURE.keywords.map((keyword) => ({
      project_id: project.id,
      subproject_id: section.id,
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
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: FIXTURE.seeds[0] } });
  return project.id;
}

const postPlan = (session: Session, projectId: string, body: unknown = { mode: "AUTO" }) =>
  callRoute(createStrategy, { method: "POST", url: `/api/projects/${projectId}/strategies`, cookie: session.cookie, params: { id: projectId }, body });

/** Avvia il lavoro di piano, lo porta in fondo e restituisce la strategia con le pagine e le keyword. */
async function planned(session: Session, projectId: string) {
  const response = await postPlan(session, projectId);
  expect(response.status).toBe(202);
  const run = await finishPlanRun(((await response.json()) as { data: { runId: string } }).data.runId);
  expect(run).toMatchObject({ status: "completed", phase: "done" });
  const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } });
  const pages = await prisma.strategyPage.findMany({ where: { strategy_id: strategy.id }, select: { id: true, kind: true, content_type: true } });
  const keywords = await prisma.strategyKeyword.findMany({ where: { strategy_id: strategy.id }, select: { page_id: true, canonical_keyword: true } });
  const pageOf = (value: string) => keywords.find((keyword) => keyword.canonical_keyword === value)?.page_id ?? null;
  const localPages = pages.filter((page) => page.content_type === "local");
  return { run, strategy, pages, keywords, pageOf, localPages };
}

const openRouterCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://openrouter.test/"));

describe("lavoro di piano con i risultati di Google", () => {
  // covers: AC-6303-1
  it("raggruppa per risultati di Google: una pagina locale con le 20 città e i 2 concorrenti tra le non assegnate", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);

    const { strategy, pages, pageOf, localPages } = await planned(admin, projectId);

    expect(strategy).toMatchObject({ grouping_source: "SERP", grouping_notice: null });
    expect(pages.filter((page) => page.kind === "HUB")).toHaveLength(1);
    expect(localPages).toHaveLength(1);
    expect(CITIES.map(pageOf)).toEqual(CITIES.map(() => localPages[0].id));
    expect(COMPETITORS.map(pageOf)).toEqual([null, null]);
    expect(pageOf(canonical("noleggio magnetoterapia prezzi"))).toBe(pageOf(canonical("noleggio magnetoterapia costo")));
    // Una sola richiesta al modello per le 38 keyword senza riconoscimento fisso, con la sua riga di ai_requests.
    expect(openRouterCalls()).toHaveLength(1);
    expect(await prisma.aiRequest.findMany({ select: { feature: true, outcome: true, by_root_admin: true } })).toEqual([
      { feature: "plan", outcome: "ok", by_root_admin: true },
    ]);
  });

  // covers: AC-6303-2
  it("con OpenRouter che risponde 503 a ogni modello il piano usa i risultati di Google con AI_CLASSIFY_UNAVAILABLE", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);
    api.aiDown = true;

    const { strategy, pageOf, localPages } = await planned(admin, projectId);

    expect(strategy).toMatchObject({ grouping_source: "SERP", grouping_notice: "AI_CLASSIFY_UNAVAILABLE" });
    expect(localPages).toHaveLength(1);
    expect(pageOf(canonical("noleggio magnetoterapia vicino a me"))).toBe(localPages[0].id);
    expect(pageOf(canonical("noleggiomagnetoterapia it"))).toBeNull();
    expect(openRouterCalls()).toHaveLength(2);
    expect((await prisma.aiRequest.findMany()).map((row) => [row.feature, row.outcome])).toEqual([
      ["plan", "unavailable"],
      ["plan", "unavailable"],
    ]);
  });

  // covers: AC-6303-3
  it("con rules.serpPageOverlap 11 la risposta è 400 VALIDATION_ERROR e nessun lavoro di piano è creato", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);

    const response = await postPlan(admin, projectId, { mode: "EXPERT", settings: { rules: { serpPageOverlap: 11 } } });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.planRun.count()).toBe(0);
    const accepted = await postPlan(admin, projectId, { mode: "EXPERT", settings: { rules: { serpPageOverlap: 10, serpHubOverlap: 10 } } });
    expect(accepted.status).toBe(202);
  });

  it("con i risultati per meno di metà delle keyword usa il motore di oggi con SERP_TOO_FEW, senza chiamare il modello", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);
    api.withResults = new Set(FIXTURE.keywords.slice(0, 10).map((keyword) => keyword.keyword));

    const { strategy } = await planned(admin, projectId);

    expect(strategy).toMatchObject({ grouping_source: "ENGINE", grouping_notice: "SERP_TOO_FEW" });
    expect(openRouterCalls()).toHaveLength(0);
  });
});
