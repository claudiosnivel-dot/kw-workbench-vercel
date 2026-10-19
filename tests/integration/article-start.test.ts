// Gate di T-4002 (AC-4002-1…3): l'avvio dell'articolo di una pagina del piano crea l'articolo in generazione e il lavoro
// pending e porta la pagina in scrittura; il limite del workspace in articoli e il tetto della piattaforma, che deve
// avere posto per la stima delle richieste, rispondono 429 (root admin escluso); funzione spenta, lavoro attivo e
// versione precedente del piano sono 503 e 409. In più la lettura dell'articolo, l'annullamento del lavoro, l'indice
// che tiene un solo lavoro attivo per articolo e le impostazioni degli articoli nella card del root admin.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as updateAiSettings } from "@/app/api/admin/ai-titles/route";
import { UserRole } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { insertPlan, memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { cancelArticleRun, readArticle, saveArticleSettings, startArticle } from "../helpers/articles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type StartBody = { data?: { articleId: string; runId: string }; code?: string; retryAfter?: number };
type ReadBody = {
  data?: {
    id: string;
    pageId: string;
    status: string;
    length: string;
    notes: string | null;
    errorCode: string | null;
    sections: { position: number; kind: string; heading: string | null; body: string }[];
    run: { id: string; scope: string; status: string; phase: string; progress: { done: number; total: number } } | null;
  };
  code?: string;
};

const FOUR_H2 = ["Come funziona", "Quanto costa", "Tempi di consegna", "Domande frequenti"];

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  await resetDatabase();
});

async function outcome(response: Response): Promise<number | string> {
  const body = (await response.clone().json()) as StartBody;
  return body.code ? `${response.status} ${body.code}` : response.status;
}

const rootAdmin = () =>
  createUserWithSession({ displayName: `t4002-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });

/** Righe di ai_requests contate dal tetto, un'ora fa. */
async function countedRequests(count: number): Promise<void> {
  const createdAt = new Date(Date.now() - 3_600_000);
  await prisma.aiRequest.createMany({
    data: Array.from({ length: count }, () => ({ feature: "titles" as const, model: "autore/modello-prova:free", outcome: "ok" as const, duration_ms: 1000, created_at: createdAt })),
  });
}

describe("avvio dell'articolo di una pagina del piano", () => {
  // covers: AC-4002-1
  it("risponde 202, crea l'articolo in generazione con lunghezza e note, il lavoro pending e porta la pagina in scrittura", async () => {
    await saveArticleSettings();
    const { owner, member, spoke } = await memberWithPlan("t4002");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { h2: FOUR_H2 } });

    const response = await startArticle(member.cookie, spoke, { length: "MEDIUM", notes: "Consegna in 24 ore" });
    const body = (await response.json()) as StartBody;

    expect(response.status).toBe(202);
    const article = await prisma.article.findUniqueOrThrow({ where: { id: body.data!.articleId }, include: { runs: true } });
    expect(article).toMatchObject({ page_id: spoke.pageId, project_id: spoke.projectId, status: "GENERATING", length: "MEDIUM", notes: "Consegna in 24 ore" });
    expect(article.runs).toHaveLength(1);
    expect(article.runs[0]).toMatchObject({ id: body.data!.runId, status: "pending", scope: "ARTICLE", workspace_id: owner.workspaceId, section_id: null });
    const page = await prisma.strategyPage.findUniqueOrThrow({ where: { id: spoke.pageId }, select: { status: true, status_changed_at: true } });
    expect(page.status).toBe("WRITING");
    expect(page.status_changed_at).not.toBeNull();
  });

  // covers: AC-4002-2
  it("il limite del workspace in articoli e il tetto della piattaforma rispondono 429 con Retry-After; il root admin no", async () => {
    await saveArticleSettings({ articlesPerWorkspaceDaily: 1 });
    const first = await memberWithPlan("t4002-w1");
    const hub = { ...first.spoke, pageId: first.plan.pageIds.hub };

    const started = await startArticle(first.member.cookie, first.spoke);
    const overWorkspace = await startArticle(first.member.cookie, hub);

    expect(await outcome(started)).toBe(202);
    expect(await outcome(overWorkspace)).toBe("429 RATE_LIMITED");
    expect(Number(overWorkspace.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await prisma.article.count({ where: { page_id: hub.pageId } })).toBe(0);

    await saveArticleSettings({ platformDailyRequests: 900 });
    const second = await memberWithPlan("t4002-w2");
    await prisma.strategyPage.update({ where: { id: second.spoke.pageId }, data: { h2: FOUR_H2 } });
    await countedRequests(895);
    const root = await rootAdmin();
    const rootPlan = await insertPlan(root);
    const rootSpoke = { projectId: rootPlan.projectId, strategyId: rootPlan.strategyId, pageId: rootPlan.pageIds.spoke };

    // 4 H2: la stima è (4 + 3) più il 30%, 10 richieste, e 895 + 10 supera 900.
    const overPlatform = await startArticle(second.member.cookie, second.spoke);
    const byRoot = await startArticle(root.cookie, rootSpoke);

    expect(await outcome(overPlatform)).toBe("429 RATE_LIMITED");
    expect(Number(overPlatform.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await overPlatform.json()) as StartBody).retryAfter).toBeGreaterThan(0);
    expect(await prisma.article.count({ where: { page_id: second.spoke.pageId } })).toBe(0);
    expect(await outcome(byRoot)).toBe(202);
  });

  // covers: AC-4002-2
  it("con posto per la stima il tetto lascia avviare l'articolo", async () => {
    await saveArticleSettings({ platformDailyRequests: 900 });
    const { member, spoke } = await memberWithPlan("t4002-room");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { h2: FOUR_H2 } });
    await countedRequests(890);

    expect(await outcome(await startArticle(member.cookie, spoke))).toBe(202);
  });

  // covers: AC-4002-3
  it("articoli spenti o senza chiave 503, lavoro attivo 409 JOB_ALREADY_ACTIVE, versione precedente 409 STRATEGY_READ_ONLY", async () => {
    const { owner, member, spoke } = await memberWithPlan("t4002");
    const previous = await insertPlan(owner, { projectId: spoke.projectId, createdAt: new Date(Date.now() - 86_400_000) });

    await saveArticleSettings({ articlesEnabled: false });
    const disabled = await startArticle(member.cookie, spoke);
    await saveArticleSettings();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const missingKey = await startArticle(member.cookie, spoke);
    stubOpenRouterEnv();
    const started = await startArticle(member.cookie, spoke);
    const active = await startArticle(member.cookie, spoke);
    const readOnly = await startArticle(member.cookie, { projectId: spoke.projectId, strategyId: previous.strategyId, pageId: previous.pageIds.spoke });

    expect(await Promise.all([disabled, missingKey, started, active, readOnly].map(outcome))).toEqual([
      "503 AI_NOT_CONFIGURED",
      "503 AI_NOT_CONFIGURED",
      202,
      "409 JOB_ALREADY_ACTIVE",
      "409 STRATEGY_READ_ONLY",
    ]);
    expect(await prisma.articleRun.count()).toBe(1);
    expect(await prisma.article.count({ where: { page_id: previous.pageIds.spoke } })).toBe(0);
  });

  it("fuori dal workspace 404, senza sessione 401, corpo non valido 400", async () => {
    await saveArticleSettings();
    const { member, spoke } = await memberWithPlan("t4002");
    const stranger = await createUserWithSession({ displayName: `t4002-stranger-${randomUUID().slice(0, 8)}` });

    const responses = [
      await startArticle(stranger.cookie, spoke),
      await startArticle(undefined, spoke),
      await startArticle(member.cookie, spoke, { length: "HUGE" }),
      await startArticle(member.cookie, spoke, { length: "SHORT", notes: "n".repeat(1001) }),
      await startArticle(member.cookie, spoke, { length: "SHORT", workspaceId: "altro" }),
    ];

    expect(await Promise.all(responses.map(outcome))).toEqual([
      "404 PROJECT_NOT_FOUND",
      "401 AUTH_REQUIRED",
      "400 VALIDATION_ERROR",
      "400 VALIDATION_ERROR",
      "400 VALIDATION_ERROR",
    ]);
    expect(await prisma.article.count()).toBe(0);
  });

  it("un nuovo avvio sostituisce l'articolo: blocchi cancellati e version cresciuta; due avvii insieme danno un 202 e un 409", async () => {
    await saveArticleSettings();
    const { member, spoke } = await memberWithPlan("t4002");
    const first = (await (await startArticle(member.cookie, spoke, { length: "SHORT" })).json()) as StartBody;
    const articleId = first.data!.articleId;
    await prisma.articleSection.create({ data: { article_id: articleId, position: 0, kind: "INTRO", body: "Testo" } });
    await prisma.article.update({ where: { id: articleId }, data: { status: "READY", meta_title: "Titolo" } });
    await prisma.articleRun.update({ where: { id: first.data!.runId }, data: { status: "completed" } });

    const both = await Promise.all([startArticle(member.cookie, spoke, { length: "LONG" }), startArticle(member.cookie, spoke, { length: "LONG" })]);

    expect((await Promise.all(both.map(outcome))).sort()).toEqual([202, "409 JOB_ALREADY_ACTIVE"]);
    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId }, include: { sections: true } });
    expect(article).toMatchObject({ status: "GENERATING", length: "LONG", meta_title: null, version: 1 });
    expect(article.sections).toEqual([]);
    expect(await prisma.articleRun.count({ where: { article_id: articleId, status: { in: ["pending", "running"] } } })).toBe(1);
  });
});

describe("lettura dell'articolo e annullamento del lavoro", () => {
  it("GET restituisce l'articolo con i blocchi in ordine e il lavoro attivo, poi 404 ARTICLE_NOT_FOUND per una pagina senza articolo", async () => {
    await saveArticleSettings();
    const { member, plan, spoke } = await memberWithPlan("t4002");
    const started = (await (await startArticle(member.cookie, spoke, { length: "SHORT", notes: "Note" })).json()) as StartBody;
    await prisma.articleSection.createMany({
      data: [
        { article_id: started.data!.articleId, position: 1, kind: "H2", heading: "Taglie", body: "Secondo" },
        { article_id: started.data!.articleId, position: 0, kind: "INTRO", body: "Primo" },
      ],
    });
    await prisma.articleRun.update({ where: { id: started.data!.runId }, data: { status: "running", progress_done: 1, progress_total: 4 } });

    const response = await readArticle(member.cookie, spoke);
    const body = (await response.json()) as ReadBody;
    const missing = await readArticle(member.cookie, { ...spoke, pageId: plan.pageIds.hub });

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ id: started.data!.articleId, pageId: spoke.pageId, status: "GENERATING", length: "SHORT", notes: "Note", errorCode: null });
    expect(body.data!.sections.map((section) => [section.position, section.kind, section.body])).toEqual([
      [0, "INTRO", "Primo"],
      [1, "H2", "Secondo"],
    ]);
    expect(body.data!.run).toMatchObject({ id: started.data!.runId, scope: "ARTICLE", status: "running", progress: { done: 1, total: 4 } });
    expect(await outcome(missing)).toBe("404 ARTICLE_NOT_FOUND");
  });

  it("DELETE .../article/run annulla il lavoro attivo e l'articolo risulta annullato; senza lavoro attivo 409", async () => {
    await saveArticleSettings();
    const { member, spoke } = await memberWithPlan("t4002");
    const started = (await (await startArticle(member.cookie, spoke)).json()) as StartBody;

    const canceled = await cancelArticleRun(member.cookie, spoke);
    const again = await cancelArticleRun(member.cookie, spoke);
    const read = (await (await readArticle(member.cookie, spoke)).json()) as ReadBody;

    expect(await outcome(canceled)).toBe(200);
    expect(await outcome(again)).toBe("409 JOB_NOT_CANCELABLE");
    expect(await prisma.articleRun.findUniqueOrThrow({ where: { id: started.data!.runId }, select: { status: true } })).toEqual({ status: "canceled" });
    expect(read.data).toMatchObject({ status: "FAILED", errorCode: "CANCELED", run: null });
    expect(await outcome(await startArticle(member.cookie, spoke))).toBe(202);
  });
});

describe("impostazioni degli articoli", () => {
  it("il root admin accende gli articoli e cambia i limiti con una riga ai.update dei soli campi cambiati; fuori intervallo 400", async () => {
    const root = await rootAdmin();
    const patch = (body: unknown) => callRoute(updateAiSettings, { method: "PATCH", url: "/api/admin/ai-titles", cookie: root.cookie, body });

    const saved = await patch({ articlesEnabled: true, articlesPerWorkspaceDaily: 5, sectionRewritesPerWorkspaceDaily: 20 });
    const invalid = [
      await patch({ articlesPerWorkspaceDaily: 0 }),
      await patch({ sectionRewritesPerWorkspaceDaily: 1001 }),
      await patch({ articlesEnabled: "sì" }),
    ];

    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { data: Record<string, unknown> }).data).toMatchObject({
      enabled: false,
      articlesEnabled: true,
      articlesPerWorkspaceDaily: 5,
      sectionRewritesPerWorkspaceDaily: 20,
    });
    expect(await Promise.all(invalid.map(outcome))).toEqual(["400 VALIDATION_ERROR", "400 VALIDATION_ERROR", "400 VALIDATION_ERROR"]);
    const rows = await prisma.adminAuditLog.findMany({ where: { action: "ai.update" } });
    expect(rows.map((row) => row.metadata)).toEqual([
      { articlesEnabled: { before: false, after: true }, articlesPerWorkspaceDaily: { before: 3, after: 5 } },
    ]);
  });
});
