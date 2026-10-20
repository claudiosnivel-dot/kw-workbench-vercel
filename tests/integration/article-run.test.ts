// Gate di T-4101 (AC-4101-1, AC-4101-2, AC-4101-4): il motore porta il lavoro di un articolo fino alla fine con la
// scaletta salvata e una riga di ai_requests per richiesta; il cron reap-jobs riprende un lavoro fermo e fallisce quello
// con 5 tentativi; il limite giornaliero dell'account fa fallire il lavoro con AI_DAILY_LIMIT. In più l'annullamento,
// anche durante una richiesta, le risposte tutte scartate e il primo passo programmato all'avvio. La continuazione è
// sostituita da un registratore: nessuna chiamata HTTP nei test.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as reapJobsCron } from "@/app/api/cron/reap-jobs/route";
import { advanceArticleRun, runArticleStep } from "@/lib/articles/run";
import { scheduleArticleRunContinuation } from "@/lib/modules/jobs/continuation";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { cancelArticleRun, modelReply, outlineCompletion, saveArticleSettings, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleArticleRunContinuation: vi.fn(),
}));

const registrar = vi.mocked(scheduleArticleRunContinuation);
const fetchMock = vi.fn<typeof fetch>();
const CRON_SECRET = randomBytes(24).toString("hex");
const STEP_MS = 270_000;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.stubEnv("JOB_MAX_ATTEMPTS", "5");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  registrar.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** Articolo avviato da un MEMBER sullo spoke del piano con lunghezza MEDIUM: lavoro pending. */
async function startedArticle(label: string) {
  const { owner, member, spoke } = await memberWithPlan(label);
  const response = await startArticle(member.cookie, spoke, { length: "MEDIUM" });
  expect(response.status).toBe(202);
  const { data } = (await response.json()) as { data: { articleId: string; runId: string } };
  return { owner, member, spoke, ...data };
}

const runRow = (id: string) => prisma.articleRun.findUniqueOrThrow({ where: { id } });
const articleRow = (id: string) => prisma.article.findUniqueOrThrow({ where: { id }, include: { sections: { orderBy: { position: "asc" } } } });

const callCron = () => callRoute(reapJobsCron, { url: "/api/cron/reap-jobs", headers: { authorization: `Bearer ${CRON_SECRET}` } });

/** Lavoro fermo: running, lease scaduta da 10 minuti e nessun battito da 10 minuti. */
async function makeStuck(runId: string, attempts: number) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
  await prisma.articleRun.update({ where: { id: runId }, data: { status: "running", attempts, locked_until: tenMinutesAgo, heartbeat_at: tenMinutesAgo } });
}

describe("motore dei lavori degli articoli", () => {
  // covers: AC-4101-1
  it("porta il lavoro a completed e l'articolo a READY con la scaletta, con 1 riga di ai_requests del workspace", async () => {
    await saveArticleSettings();
    const { owner, articleId, runId } = await startedArticle("t4101-a");
    // Il primo passo parte con la continuazione programmata dall'avvio.
    expect(registrar.mock.calls).toEqual([[runId]]);
    fetchMock.mockImplementation(async (_url, init) => outlineCompletion(init));

    const step = await advanceArticleRun(runId, Date.now() + STEP_MS);

    expect(step).toMatchObject({ status: "completed", more: false });
    const run = await runRow(runId);
    expect(run).toMatchObject({ status: "completed", phase: "done", locked_until: null, progress_done: 4, progress_total: 4 });
    const article = await articleRow(articleId);
    expect(article).toMatchObject({ status: "READY", error_code: null, meta_title: "scarpe running donna", slug: "scarpe-running-donna" });
    expect(article.outline).toMatchObject({ model: "autore/modello-prova:free", blocks: [{ kind: "INTRO" }, { kind: "H2", heading: "H2 spoke" }] });
    expect(article.images).toMatchObject([{ cover: true, aspectRatio: "16:9", fileName: "scarpe-running-donna.webp" }]);
    expect(article.sections.map((section) => [section.position, section.kind, section.heading, section.body])).toEqual([
      [0, "INTRO", null, ""],
      [1, "H2", "H2 spoke", ""],
    ]);
    const requests = await prisma.aiRequest.findMany();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ feature: "article", outcome: "ok", workspace_id: owner.workspaceId, by_root_admin: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Un passo su un lavoro finito non fa nulla.
    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed", more: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // covers: AC-4101-2
  it("il cron riprende un lavoro fermo da 10 minuti, che poi si completa; con 5 tentativi il lavoro è failed e l'articolo FAILED", async () => {
    await saveArticleSettings();
    const stuck = await startedArticle("t4101-b");
    const exhausted = await startedArticle("t4101-c");
    await makeStuck(stuck.runId, 1);
    await makeStuck(exhausted.runId, 5);
    registrar.mockClear();
    fetchMock.mockImplementation(async (_url, init) => outlineCompletion(init));

    const response = await callCron();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resumed: 1, failed: 1 });
    expect(registrar.mock.calls).toEqual([[stuck.runId]]);
    expect(await runRow(stuck.runId)).toMatchObject({ status: "running", attempts: 2 });
    expect(await runRow(exhausted.runId)).toMatchObject({ status: "failed", error_code: "INTERNAL_ERROR", locked_until: null });
    expect(await articleRow(exhausted.articleId)).toMatchObject({ status: "FAILED", error_code: "INTERNAL_ERROR" });

    // La continuazione registrata esegue il passo: il lavoro ripreso si completa.
    await runArticleStep(stuck.runId);
    expect(await runRow(stuck.runId)).toMatchObject({ status: "completed" });
    expect(await articleRow(stuck.articleId)).toMatchObject({ status: "READY" });

    // Una seconda consegna del cron non trova più nulla da riprendere.
    expect(await (await callCron()).json()).toEqual({ resumed: 0, failed: 0 });
  });

  // covers: AC-4101-4
  it("con models [A] e A che risponde 429 per il limite giornaliero dell'account il lavoro è failed con AI_DAILY_LIMIT", async () => {
    await saveArticleSettings({ models: ["autore/modello-a:free"] });
    const { articleId, runId } = await startedArticle("t4101-d");
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: 429, message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } },
        { status: 429 }
      )
    );

    const step = await advanceArticleRun(runId, Date.now() + STEP_MS);

    expect(step).toMatchObject({ status: "failed", more: false });
    expect(await runRow(runId)).toMatchObject({ status: "failed", error_code: "AI_DAILY_LIMIT", locked_until: null });
    expect(await articleRow(articleId)).toMatchObject({ status: "FAILED", error_code: "AI_DAILY_LIMIT", sections: [] });
    expect(await prisma.aiRequest.findMany({ select: { feature: true, outcome: true } })).toEqual([{ feature: "article", outcome: "account_daily_limit" }]);
  });

  it("con tutte le risposte scartate dal controllo il lavoro è failed con AI_INVALID_RESPONSE", async () => {
    await saveArticleSettings({ models: ["autore/modello-a:free", "autore/modello-b:free"] });
    const { articleId, runId } = await startedArticle("t4101-e");
    fetchMock.mockImplementation(async () => modelReply({ blocks: [] }));

    await advanceArticleRun(runId, Date.now() + STEP_MS);

    expect(await runRow(runId)).toMatchObject({ status: "failed", error_code: "AI_INVALID_RESPONSE" });
    expect(await articleRow(articleId)).toMatchObject({ status: "FAILED", error_code: "AI_INVALID_RESPONSE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("annullamento del lavoro", () => {
  it("un lavoro annullato prima del passo non fa richieste", async () => {
    await saveArticleSettings();
    const { member, spoke, runId } = await startedArticle("t4101-f");
    expect((await cancelArticleRun(member.cookie, spoke)).status).toBe(200);

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "canceled", more: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un annullamento durante la richiesta ferma il passo senza salvare la scaletta", async () => {
    await saveArticleSettings();
    const { member, spoke, articleId, runId } = await startedArticle("t4101-g");
    fetchMock.mockImplementation(async (_url, init) => {
      expect((await cancelArticleRun(member.cookie, spoke)).status).toBe(200);
      return outlineCompletion(init);
    });

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "canceled", more: false });

    expect(await runRow(runId)).toMatchObject({ status: "canceled", phase: "outline" });
    expect(await articleRow(articleId)).toMatchObject({ status: "FAILED", error_code: "CANCELED", meta_title: null, outline: null, sections: [] });
  });
});
