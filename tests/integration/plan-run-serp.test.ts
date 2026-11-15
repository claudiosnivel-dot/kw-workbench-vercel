// Gate di T-6303 (AC-6303-1…AC-6303-3, D-57): il lavoro di piano raggruppa con i risultati di Google quando ci sono
// per almeno metà delle keyword, riconosce luoghi e concorrenti con l'AI (una riga di ai_requests per tentativo, funzione
// plan) e salva la strategia con grouping_source SERP; con l'AI che non risponde restano i riconoscimenti fissi e il
// motivo AI_CLASSIFY_UNAVAILABLE; una regola nuova fuori dai limiti è 400 senza lavoro. DataForSEO e OpenRouter sono
// simulati con i dati della fixture it-magnetoterapia-serp.json: nessuna chiamata reale. In più: pochi risultati di
// Google danno il motore di oggi con SERP_TOO_FEW, senza richieste al modello.
// Gate di T-6501 (AC-6501-1, AC-6501-2, D-60): la classificazione manda al modello gruppi di al più 100 keyword, un
// gruppo per volta, e aspetta un modello fino a 90 s, così una risposta che arriva dopo 60 s vale al primo tentativo.
// Gate di T-6702 (AC-6702-3, AC-6702-4, D-62): la keyword principale di una pagina sciolta è salvata come angolo da
// valutare e la GET della strategia la espone; con la classificazione dell'AI non riuscita nessun angolo.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readStrategyRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/route";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { resetEnvForTests } from "@/lib/env";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { advancePlanRun } from "@/lib/modules/plan-runs/run";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import type { StrategyView } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";
import { saveAiSettings, stubOpenRouterEnv } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { finishPlanRun, noVolumesResponse, VOLUMES_URL_PART } from "../helpers/plan-run";
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
  /** Risultati di Google delle keyword generate dal test, fuori dalla fixture. */
  generated: new Map<string, string[]>(),
  /** OpenRouter risponde dopo questa attesa (timer finti). */
  aiDelayMs: 0,
}));

/** DataForSEO simulato (risultati di Google della fixture) e OpenRouter simulato (classi della fixture). */
/** Keyword del messaggio dell'utente di una richiesta a OpenRouter. */
function sentKeywords(init: RequestInit | undefined): string[] {
  const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
  return (JSON.parse(body.messages.find((message) => message.role === "user")!.content) as { keywords: string[] }).keywords;
}

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://openrouter.test/")) {
    if (api.aiDown) return new Response("{}", { status: 503 });
    if (api.aiDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, api.aiDelayMs));
    const body = JSON.parse(String(init?.body)) as { model: string };
    const answer = Object.fromEntries(
      sentKeywords(init).filter((keyword) => (classOf.get(keyword) ?? "other") !== "other").map((keyword) => [keyword, classOf.get(keyword)])
    );
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
    const urls = !api.withResults || api.withResults.has(keyword) ? (byKeyword.get(keyword)?.urls ?? api.generated.get(keyword) ?? []) : [];
    const items = urls.map((link, index) => ({ type: "organic", rank_absolute: index + 1, url: link }));
    return Response.json({ status_code: 20000, cost: 0, tasks: [{ id, status_code: 20000, cost: 0, result: [{ keyword, items }] }] });
  }
  // Volumi delle keyword tenute senza volume (T-6102): DataForSEO non ne ha.
  if (url.includes(VOLUMES_URL_PART)) return noVolumesResponse(init);
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
  api.generated.clear();
  api.aiDelayMs = 0;
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

/**
 * Progetto it-IT del root admin con count keyword tenute generate, senza modificatori locali e senza il nome del dominio
 * del primo risultato: nessuna ha un riconoscimento fisso e tutte hanno 10 risultati di Google.
 */
async function generatedProject(session: Session, count: number) {
  const project = await prisma.project.create({
    data: { name: "Magnetoterapia", workspace_id: session.workspaceId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  const texts = Array.from({ length: count }, (_, index) => `magnetoterapia guida ${String(index + 1).padStart(3, "0")}`);
  texts.forEach((text, index) => {
    api.generated.set(text, Array.from({ length: 10 }, (_, rank) => `https://www.risorsa-${(index + rank) % 23}.example/pagina-${index}-${rank}`));
  });
  await prisma.keywordCandidate.createMany({
    data: texts.map((text) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword: text,
      normalized_keyword: text,
      canonical_keyword: canonical(text),
      source: "seed",
      source_query: "magnetoterapia",
      score: 50,
      avg_monthly_searches: 50,
    })),
  });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "magnetoterapia" } });
  expect(new Set(texts.map(canonical)).size).toBe(count);
  return project.id;
}

/**
 * Keyword tenuta senza volume con 10 risultati di Google che nessun'altra keyword del progetto ha: forma una pagina sotto
 * soglia che il motore scioglie.
 */
async function addLoneKeyword(projectId: string, text: string) {
  api.generated.set(text, Array.from({ length: 10 }, (_, rank) => `https://www.ortopedia-${rank}.example/articolo-${rank}`));
  const section = await prisma.subproject.findFirstOrThrow({ where: { project_id: projectId } });
  await prisma.keywordCandidate.create({
    data: {
      project_id: projectId,
      subproject_id: section.id,
      keyword: text,
      normalized_keyword: text,
      canonical_keyword: canonical(text),
      source: "seed",
      source_query: FIXTURE.seeds[0],
      score: 50,
      avg_monthly_searches: null,
    },
  });
}

async function readPlanView(session: Session, projectId: string, strategyId: string): Promise<StrategyView> {
  const response = await callRoute(readStrategyRoute, {
    url: `/api/projects/${projectId}/strategies/${strategyId}`,
    cookie: session.cookie,
    params: { id: projectId, strategyId },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: StrategyView }).data;
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

const runRow = (id: string) => prisma.planRun.findUniqueOrThrow({ where: { id } });

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

describe("angoli da valutare (T-6702)", () => {
  const LONE = "noleggio magnetoterapia spalla";

  // covers: AC-6702-3
  it("la keyword principale di una pagina sciolta è salvata con angle true e la GET della strategia la espone", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);
    await addLoneKeyword(projectId, LONE);

    const { strategy } = await planned(admin, projectId);

    expect(strategy).toMatchObject({ grouping_source: "SERP", grouping_notice: null });
    const row = await prisma.strategyKeyword.findFirstOrThrow({ where: { strategy_id: strategy.id, canonical_keyword: canonical(LONE) } });
    expect(row).toMatchObject({ angle: true, role: "SECONDARY" });
    expect(row.page_id).not.toBeNull();

    const view = await readPlanView(admin, projectId, strategy.id);
    const pages = view.hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]);
    expect(pages.flatMap((page) => page.keywords).find((keyword) => keyword.canonical === canonical(LONE))).toMatchObject({ angle: true });
    const mains = pages.map((page) => page.keywords.find((keyword) => keyword.role === "MAIN")!);
    expect(mains.length).toBeGreaterThan(1);
    expect(mains.every((keyword) => keyword.angle === false)).toBe(true);
    // Luoghi e concorrenti non sono mai angoli.
    const angles = pages.flatMap((page) => page.keywords).filter((keyword) => keyword.angle).map((keyword) => keyword.canonical);
    for (const excluded of [...CITIES, ...COMPETITORS]) expect(angles).not.toContain(excluded);
    expect(view.unassigned.every((keyword) => keyword.angle === false)).toBe(true);
  });

  // covers: AC-6702-4
  it("con OpenRouter che risponde 503 a ogni modello il piano è salvato senza angoli", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);
    await addLoneKeyword(projectId, LONE);
    api.aiDown = true;

    const { strategy, pageOf } = await planned(admin, projectId);

    expect(strategy).toMatchObject({ grouping_source: "SERP", grouping_notice: "AI_CLASSIFY_UNAVAILABLE" });
    expect(pageOf(canonical(LONE))).not.toBeNull();
    expect(await prisma.strategyKeyword.count({ where: { strategy_id: strategy.id, angle: true } })).toBe(0);
  });
});

describe("classificazione del piano a lotti di 100 (T-6501)", () => {
  // covers: AC-6501-1
  it("250 keyword senza riconoscimento fisso vanno al modello in 3 richieste da 100, 100 e 50", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await generatedProject(admin, 250);

    const { strategy } = await planned(admin, projectId);

    expect(strategy).toMatchObject({ grouping_source: "SERP", grouping_notice: null });
    expect(openRouterCalls().map(([, init]) => sentKeywords(init).length)).toEqual([100, 100, 50]);
    expect(await prisma.aiRequest.findMany({ select: { feature: true, outcome: true } })).toEqual([
      { feature: "plan", outcome: "ok" },
      { feature: "plan", outcome: "ok" },
      { feature: "plan", outcome: "ok" },
    ]);
  });

  // covers: AC-6501-2
  it("una risposta che arriva dopo 60 s vale al primo tentativo e le classi del gruppo restano nel cursore", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await fixtureProject(admin);
    const response = await postPlan(admin, projectId);
    expect(response.status).toBe(202);
    const { runId } = ((await response.json()) as { data: { runId: string } }).data;
    // Con meno di 60 s davanti ogni passo esegue una sola fase: volumi, invio e raccolta dei risultati, poi classify.
    for (let step = 0; step < 5 && (await runRow(runId)).phase !== "classify"; step += 1) {
      await advancePlanRun(runId, Date.now() + 59_000);
    }
    expect(await runRow(runId)).toMatchObject({ status: "running", phase: "classify" });
    expect(openRouterCalls()).toHaveLength(0);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      api.aiDelayMs = 60_000;
      const pending = advancePlanRun(runId, Date.now() + 270_000);
      await vi.waitFor(() => expect(openRouterCalls()).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(60_000);
      const step = await pending;

      expect(step).toMatchObject({ status: "completed", more: false });
      const run = await runRow(runId);
      const cursor = (run.cursor as { classify: { offset: number; place: string[]; competitor: string[]; notice: string | null } }).classify;
      const expected = (value: string) => FIXTURE.keywords.filter((keyword) => keyword.class === value).map((keyword) => canonical(keyword.keyword)).sort();
      expect({ ...cursor, place: [...cursor.place].sort(), competitor: [...cursor.competitor].sort() }).toEqual({
        offset: FIXTURE.keywords.length,
        place: expected("place"),
        competitor: expected("competitor"),
        notice: null,
      });
      expect(await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } })).toMatchObject({ grouping_source: "SERP", grouping_notice: null });
      expect(await prisma.aiRequest.findMany({ select: { feature: true, outcome: true } })).toEqual([{ feature: "plan", outcome: "ok" }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
