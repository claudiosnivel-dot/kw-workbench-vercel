// Gate di T-6901 (AC-6901-2, AC-6901-3, D-62): dopo il salvataggio del piano la fase advise chiede all'AI un consiglio
// per ogni angolo da valutare e lo salva con l'angolo (una riga di ai_requests per tentativo, funzione plan); la GET della
// strategia lo espone con l'id della pagina target. Con l'AI che non risponde il lavoro si chiude a completed con la
// strategia salvata, gli angoli senza consiglio e grouping_notice invariato. DataForSEO e OpenRouter sono simulati con i
// dati della fixture it-magnetoterapia-serp.json: nessuna chiamata reale. Gate di AC-6901-5 (2026-11-16): un'alternativa
// salvata che è solo un codice d'azione si legge come null. In più: lotti di 40 angoli, la funzione AI spenta, e un
// lavoro con la strategia salvata che non diventa mai failed. Gate di T-7701 (AC-7701-1, AC-7701-2, D-65): degli angoli
// con le stesse parole va al modello solo il più cercato, e il suo consiglio vale uguale per tutti; i lotti contano i
// gruppi.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readStrategyRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/route";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { resetEnvForTests } from "@/lib/env";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { advancePlanRun, failPlanRun } from "@/lib/modules/plan-runs/run";
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

const SHOULDER = "noleggio magnetoterapia spalla";
const NIGHT = "magnetoterapia notturna noleggio";
const MAT = "tappetino magnetoterapia noleggio";
const MATS = "noleggio tappetini per magnetoterapia";

type AdviceRequest = {
  pages: { main: string; h1: string; kind: "hub" | "spoke"; hub?: string }[];
  angles: { keyword: string; page: string }[];
};

const api = vi.hoisted(() => ({
  /** Keyword di ogni task dei risultati di Google creato, per id. */
  tasks: new Map<string, string>(),
  /** Risultati di Google delle keyword aggiunte dal test, fuori dalla fixture. */
  generated: new Map<string, string[]>(),
  /** OpenRouter risponde 503 a ogni modello per il consiglio sugli angoli (la classificazione risponde). */
  adviceDown: false,
}));

/** Messaggio dell'utente di una richiesta a OpenRouter, già letto come JSON. */
function userMessage(init: RequestInit | undefined): Record<string, unknown> {
  const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
  return JSON.parse(body.messages.find((message) => message.role === "user")!.content) as Record<string, unknown>;
}

const isAdviceRequest = (init: RequestInit | undefined) => "angles" in userMessage(init);

/**
 * Consiglio simulato: il primo angolo di ogni lotto diventa una pagina sotto la prima pagina principale, gli altri vanno
 * nella prima pagina diversa dalla loro; una voce in più per un angolo che non esiste si scarta.
 */
function adviceAnswer({ pages, angles }: AdviceRequest) {
  const hub = pages.find((page) => page.kind === "hub")!;
  const answer: Record<string, unknown> = { "keyword che non esiste": { action: "keep", reason: "Resta." } };
  angles.forEach((angle, index) => {
    answer[angle.keyword] =
      index === 0
        ? { action: "page", target: hub.main, reason: `Chi cerca «${angle.keyword}» ha un'altra domanda.`, h1: `Guida: ${angle.keyword}` }
        : { action: "move", target: pages.find((page) => page.main !== angle.page)!.main, reason: "Stesso argomento di un'altra pagina." };
  });
  return answer;
}

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://openrouter.test/")) {
    const body = JSON.parse(String(init?.body)) as { model: string };
    const message = userMessage(init);
    if ("angles" in message) {
      if (api.adviceDown) return new Response("{}", { status: 503 });
      return Response.json({ model: body.model, choices: [{ message: { content: JSON.stringify(adviceAnswer(message as AdviceRequest)) } }] });
    }
    const answer = Object.fromEntries(
      (message.keywords as string[]).filter((keyword) => (classOf.get(keyword) ?? "other") !== "other").map((keyword) => [keyword, classOf.get(keyword)])
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
    const urls = byKeyword.get(keyword)?.urls ?? api.generated.get(keyword) ?? [];
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
  api.generated.clear();
  api.adviceDown = false;
});

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

/**
 * Progetto it-IT del root admin con le keyword tenute della fixture e, per ogni testo indicato, una keyword (senza volume
 * o con quello indicato, sotto la soglia di uno spoke) con 10 risultati di Google che nessun'altra ha: ognuna forma una
 * pagina sotto soglia che il motore scioglie, e la sua keyword diventa un angolo da valutare.
 */
async function projectWithAngles(session: Session, angles: string[], volumes: Record<string, number> = {}) {
  const project = await prisma.project.create({
    data: { name: "Noleggio magnetoterapia", workspace_id: session.workspaceId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  const keyword = (text: string, volume: number | null, score: number, isQuestion = false) => ({
    project_id: project.id,
    subproject_id: section.id,
    keyword: text,
    normalized_keyword: text,
    canonical_keyword: canonical(text),
    source: "seed" as const,
    source_query: FIXTURE.seeds[0],
    score,
    avg_monthly_searches: volume,
    is_question: isQuestion,
  });
  angles.forEach((text, index) => {
    api.generated.set(text, Array.from({ length: 10 }, (_, rank) => `https://www.angolo-${index}-${rank}.example/articolo-${rank}`));
  });
  await prisma.keywordCandidate.createMany({
    data: [
      ...FIXTURE.keywords.map((item) => keyword(item.keyword, item.volume, item.score ?? 50, item.isQuestion ?? false)),
      ...angles.map((text) => keyword(text, volumes[text] ?? null, 50)),
    ],
  });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: FIXTURE.seeds[0] } });
  return project.id;
}

const postPlan = (session: Session, projectId: string) =>
  callRoute(createStrategy, { method: "POST", url: `/api/projects/${projectId}/strategies`, cookie: session.cookie, params: { id: projectId }, body: { mode: "AUTO" } });

async function startPlan(session: Session, projectId: string): Promise<string> {
  const response = await postPlan(session, projectId);
  expect(response.status).toBe(202);
  return ((await response.json()) as { data: { runId: string } }).data.runId;
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

const openRouterCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://openrouter.test/"));
const adviceCalls = () => openRouterCalls().filter(([, init]) => isAdviceRequest(init));

const angleRows = (strategyId: string) =>
  prisma.strategyKeyword.findMany({ where: { strategy_id: strategyId, angle: true }, orderBy: { canonical_keyword: "asc" } });

/** Angoli di ogni richiesta di consiglio a OpenRouter, nell'ordine delle richieste. */
const sentAngles = () => adviceCalls().map(([, init]) => (userMessage(init) as AdviceRequest).angles.map((angle) => angle.keyword));

describe("consiglio dell'AI sugli angoli nel lavoro di piano (T-6901)", () => {
  // covers: AC-6901-2
  it("salva un consiglio per ciascuno dei due angoli e la GET della strategia lo espone con l'id della pagina target", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithAngles(admin, [SHOULDER, NIGHT]);

    const run = await finishPlanRun(await startPlan(admin, projectId));

    expect(run).toMatchObject({ status: "completed", phase: "done" });
    const strategyId = run.strategy_id!;
    expect(await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId } })).toMatchObject({ grouping_source: "SERP", grouping_notice: null });
    const rows = await angleRows(strategyId);
    expect(rows.map((row) => row.canonical_keyword).sort()).toEqual([canonical(NIGHT), canonical(SHOULDER)].sort());
    for (const row of rows) {
      expect(row.angle_advice).toMatchObject({ action: expect.stringMatching(/^(page|move)$/), reason: expect.any(String) });
    }
    // Una richiesta per la classificazione e una per il consiglio, ciascuna con la sua riga di ai_requests.
    expect(openRouterCalls()).toHaveLength(2);
    expect(adviceCalls()).toHaveLength(1);
    expect((userMessage(adviceCalls()[0][1]) as AdviceRequest).angles.map((angle) => angle.keyword).sort()).toEqual([NIGHT, SHOULDER].sort());
    expect(await prisma.aiRequest.findMany({ select: { feature: true, outcome: true } })).toEqual([
      { feature: "plan", outcome: "ok" },
      { feature: "plan", outcome: "ok" },
    ]);

    const view = await readPlanView(admin, projectId, strategyId);
    const pages = view.hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]);
    const pageWithMain = new Map(pages.map((page) => [page.keywords.find((keyword) => keyword.role === "MAIN")!.canonical, page.id]));
    const angles = pages.flatMap((page) => page.keywords).filter((keyword) => keyword.angle);
    expect(angles).toHaveLength(2);
    for (const keyword of angles) {
      const saved = rows.find((row) => row.id === keyword.id)!.angle_advice as { action: string; target: string; reason: string; h1: string | null };
      expect(keyword.angleAdvice).toEqual({ action: saved.action, pageId: pageWithMain.get(saved.target)!, reason: saved.reason, alternative: null, h1: saved.h1 });
      expect(keyword.angleAdvice!.pageId).toEqual(expect.any(String));
    }
    const page = angles.find((keyword) => keyword.angleAdvice!.action === "page")!;
    expect(page.angleAdvice).toMatchObject({ pageId: view.hubs[0].pillar.id, h1: `Guida: ${page.keyword}` });
    // Le keyword che non sono angoli non hanno consiglio.
    expect(pages.flatMap((item) => item.keywords).filter((keyword) => !keyword.angle).every((keyword) => keyword.angleAdvice === null)).toBe(true);
  });

  // covers: AC-6901-3
  it("con OpenRouter che risponde 503 a ogni modello per il consiglio il lavoro è completed con gli angoli senza consiglio", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithAngles(admin, [SHOULDER, NIGHT]);
    api.adviceDown = true;

    const run = await finishPlanRun(await startPlan(admin, projectId));

    expect(run).toMatchObject({ status: "completed", phase: "done", error_code: null });
    expect(await prisma.strategy.findUniqueOrThrow({ where: { id: run.strategy_id! } })).toMatchObject({ grouping_source: "SERP", grouping_notice: null });
    const rows = await angleRows(run.strategy_id!);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.angle, row.angle_advice])).toEqual([
      [true, null],
      [true, null],
    ]);
    expect(adviceCalls()).toHaveLength(2);
    expect((await prisma.aiRequest.findMany({ orderBy: { created_at: "asc" } })).map((row) => [row.feature, row.outcome])).toEqual([
      ["plan", "ok"],
      ["plan", "unavailable"],
      ["plan", "unavailable"],
    ]);
  });

  // covers: AC-6901-5
  it("un consiglio salvato con il solo codice d'azione come alternativa si legge con alternative null", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithAngles(admin, [SHOULDER]);
    const run = await finishPlanRun(await startPlan(admin, projectId));
    const [row] = await angleRows(run.strategy_id!);
    const saved = row.angle_advice as { action: string; target: string; reason: string };
    // Come i consigli salvati in produzione prima della correzione del 2026-11-16.
    await prisma.strategyKeyword.update({ where: { id: row.id }, data: { angle_advice: { ...saved, alternative: "keep" } } });

    const view = await readPlanView(admin, projectId, run.strategy_id!);

    const keyword = view.hubs.flatMap((hub) => [hub.pillar, ...hub.spokes]).flatMap((page) => page.keywords).find((item) => item.id === row.id)!;
    expect(keyword.angleAdvice).toMatchObject({ action: saved.action, reason: saved.reason, alternative: null });
  });

  it("45 angoli vanno al modello in due lotti da 40 e 5 e tutti ricevono il consiglio", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const texts = Array.from({ length: 45 }, (_, index) => `noleggio magnetoterapia variante ${String(index + 1).padStart(2, "0")}`);
    const projectId = await projectWithAngles(admin, texts);

    const run = await finishPlanRun(await startPlan(admin, projectId));

    expect(run).toMatchObject({ status: "completed", phase: "done" });
    expect(adviceCalls().map(([, init]) => (userMessage(init) as AdviceRequest).angles.length)).toEqual([40, 5]);
    const rows = await angleRows(run.strategy_id!);
    expect(rows).toHaveLength(45);
    expect(rows.every((row) => row.angle_advice !== null)).toBe(true);
  });

  it("con la funzione AI spenta il piano è salvato con gli angoli e nessuna richiesta di consiglio", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithAngles(admin, [SHOULDER]);
    const runId = await startPlan(admin, projectId);
    // La classificazione risponde (servono i luoghi dell'AI per avere angoli); poi la funzione si spegne.
    for (let step = 0; step < 10 && (await prisma.planRun.findUniqueOrThrow({ where: { id: runId } })).phase !== "advise"; step += 1) {
      await advancePlanRun(runId, Date.now() + 59_000);
    }
    expect(await prisma.planRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "running", phase: "advise" });
    await saveAiSettings({ enabled: false });

    const run = await finishPlanRun(runId);

    expect(run).toMatchObject({ status: "completed", phase: "done" });
    expect(adviceCalls()).toHaveLength(0);
    expect((await angleRows(run.strategy_id!)).map((row) => row.angle_advice)).toEqual([null]);
  });

  it("un lavoro fermo nella fase advise con la strategia salvata si chiude a completed, mai a failed", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithAngles(admin, [SHOULDER]);
    const runId = await startPlan(admin, projectId);
    for (let step = 0; step < 10 && (await prisma.planRun.findUniqueOrThrow({ where: { id: runId } })).phase !== "advise"; step += 1) {
      await advancePlanRun(runId, Date.now() + 59_000);
    }
    const saved = await prisma.planRun.findUniqueOrThrow({ where: { id: runId } });
    expect(saved).toMatchObject({ status: "running", phase: "advise" });
    expect(saved.strategy_id).not.toBeNull();

    expect(await failPlanRun(runId, "INTERNAL_ERROR")).toBe(false);

    expect(await prisma.planRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({
      status: "completed",
      phase: "done",
      error_code: null,
      strategy_id: saved.strategy_id,
    });
    expect(adviceCalls()).toHaveLength(0);
  });
});

describe("un solo consiglio per gli angoli che sono la stessa ricerca (T-7701)", () => {
  // covers: AC-7701-1
  it("dei due angoli sul tappetino va al modello solo il più cercato e il consiglio vale uguale per entrambi", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const projectId = await projectWithAngles(admin, [MAT, MATS], { [MAT]: 90, [MATS]: 20 });

    const run = await finishPlanRun(await startPlan(admin, projectId));

    expect(run).toMatchObject({ status: "completed", phase: "done" });
    expect(sentAngles()).toEqual([[MAT]]);
    const rows = await angleRows(run.strategy_id!);
    expect(rows.map((row) => [row.canonical_keyword, row.volume])).toEqual([
      [canonical(MATS), 20],
      [canonical(MAT), 90],
    ]);
    const adviceOf = (text: string) => rows.find((row) => row.canonical_keyword === canonical(text))!.angle_advice;
    expect(adviceOf(MAT)).toMatchObject({ action: "page", target: expect.any(String), reason: `Chi cerca «${MAT}» ha un'altra domanda.` });
    expect(adviceOf(MATS)).toEqual(adviceOf(MAT));
  });

  // covers: AC-7701-2
  it("45 angoli con 10 coppie con le stesse radici vanno al modello come 35 in un solo lotto e tutti hanno il consiglio", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const number = (index: number) => String(index + 1).padStart(2, "0");
    const singles = Array.from({ length: 25 }, (_, index) => `noleggio magnetoterapia variante ${number(index)}`);
    const pairs = Array.from({ length: 10 }, (_, index) => [`noleggio magnetoterapia modello ${number(index)}`, `modelli per noleggio magnetoterapia ${number(index)}`]);
    const projectId = await projectWithAngles(admin, [...singles, ...pairs.flat()]);

    const run = await finishPlanRun(await startPlan(admin, projectId));

    expect(run).toMatchObject({ status: "completed", phase: "done" });
    expect(sentAngles().map((angles) => angles.length)).toEqual([35]);
    // Senza volumi il rappresentante della coppia è la forma canonica più corta.
    expect(sentAngles()[0]).toEqual(expect.arrayContaining([...singles, ...pairs.map(([shorter]) => shorter)]));
    const rows = await angleRows(run.strategy_id!);
    expect(rows).toHaveLength(45);
    expect(rows.every((row) => row.angle_advice !== null)).toBe(true);
    const adviceOf = (text: string) => rows.find((row) => row.canonical_keyword === canonical(text))!.angle_advice;
    for (const [shorter, longer] of pairs) expect(adviceOf(longer)).toEqual(adviceOf(shorter));
  });
});
