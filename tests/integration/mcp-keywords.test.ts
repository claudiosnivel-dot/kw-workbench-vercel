// Gate di T-7302 (AC-7302-1…4): Claude Code legge le keyword a pagine da 200 e le tiene o le scarta; i suoi lavori che
// spendono si fermano al tetto giornaliero (D-65), che conta solo le richieste a pagamento dei lavori con origin AGENT.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchAgentSettings } from "@/app/api/admin/agent-key/settings/route";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { agentSpendToday, reserveProviderRequest } from "@/lib/modules/providers/metrics/metrics-ledger";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { callTool, rootAdminWithKey } from "../helpers/mcp";

vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

type ListedKeyword = { id: string; keyword: string; volume: number | null; score: number | null; intent: string; type: string; kept: boolean };
type KeywordsPage = { total: number; page: number; pages: number; keywords: ListedKeyword[] };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  // Il tetto sta fra le impostazioni cifrate dell'amministrazione (app_settings).
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.mocked(scheduleJobContinuation).mockClear();
  await resetDatabase();
});

function patchCap(cookie: string, body: unknown) {
  return callRoute(patchAgentSettings, { method: "PATCH", url: "/api/admin/agent-key/settings", body, cookie });
}

/** Progetto del root admin con un argomento e le keyword indicate: le prime `discarded` scartate. */
async function projectWithKeywords(workspaceId: string, count: number, discarded = 0) {
  const project = await prisma.project.create({ data: { name: "Magnetoterapia", workspace_id: workspaceId, language_code: "it", country_code: "IT" } });
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Noleggio", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: "noleggio magnetoterapia" } });
  await prisma.keywordCandidate.createMany({
    data: Array.from({ length: count }, (_, index) => {
      const keyword = `magnetoterapia ${String(index).padStart(3, "0")}`;
      return {
        project_id: project.id,
        subproject_id: topic.id,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: "noleggio magnetoterapia",
        score: 100 - (index % 100),
        avg_monthly_searches: 10 * (index + 1),
        search_intent: "commercial" as const,
        keyword_type: "service" as const,
        review_status: index < discarded ? ("rejected" as const) : ("pending" as const),
      };
    }),
  });
  return { projectId: project.id, topicId: topic.id };
}

/** Richiesta a pagamento di oggi con il costo stimato, di un lavoro dell'argomento con l'origine indicata. */
async function paidRequest(projectId: string, topicId: string, origin: "APP" | "AGENT", estimatedCostUsd: number) {
  const job = await prisma.job.create({ data: { project_id: projectId, subproject_id: topicId, status: "completed", phase: "done", origin } });
  const reservation = await reserveProviderRequest({ provider: "DATAFORSEO", projectId, jobId: job.id, keywordCount: 100, runRequestIds: [], estimatedCostUsd });
  expect(reservation.ok).toBe(true);
  return job;
}

describe("list_keywords e set_keywords del server MCP", () => {
  // covers: AC-7302-1
  it("con 450 keyword e 30 scartate la pagina 1 ha 200 tenute con i dati, totale 420 e 3 pagine; la pagina 3 ne ha 20", async () => {
    const root = await rootAdminWithKey("t7302-list");
    const { projectId } = await projectWithKeywords(root.workspaceId, 450, 30);

    const first = await callTool(root.key, "list_keywords", { projectId, status: "kept", page: 1 });
    const third = await callTool(root.key, "list_keywords", { projectId, status: "kept", page: 3 });

    const page1 = first.data as unknown as KeywordsPage;
    expect(page1).toMatchObject({ total: 420, page: 1, pages: 3 });
    expect(page1.keywords).toHaveLength(200);
    expect(page1.keywords[0]).toMatchObject({ volume: expect.any(Number), score: 100, intent: "commercial", type: "service", kept: true });
    expect(page1.keywords.every((row) => row.kept)).toBe(true);
    const page3 = third.data as unknown as KeywordsPage;
    expect(page3).toMatchObject({ total: 420, page: 3, pages: 3 });
    expect(page3.keywords).toHaveLength(20);
    const ids = new Set([...page1.keywords, ...page3.keywords].map((row) => row.id));
    expect(ids.size).toBe(220);
  });

  // covers: AC-7302-2
  it("set_keywords con discard e tre id dice 3 righe aggiornate e le tre keyword sono rejected", async () => {
    const root = await rootAdminWithKey("t7302-set");
    const { projectId } = await projectWithKeywords(root.workspaceId, 5);
    const three = await prisma.keywordCandidate.findMany({ where: { project_id: projectId }, take: 3, orderBy: { keyword: "asc" }, select: { id: true } });

    const { result, data } = await callTool(root.key, "set_keywords", { projectId, action: "discard", ids: three.map((row) => row.id) });

    expect(result?.isError).not.toBe(true);
    expect(data).toEqual({ updated: 3 });
    const rows = await prisma.keywordCandidate.findMany({ where: { id: { in: three.map((row) => row.id) } }, select: { review_status: true } });
    expect(rows.map((row) => row.review_status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(await prisma.keywordCandidate.count({ where: { project_id: projectId, review_status: "pending" } })).toBe(2);
  });

  it("filtra per volume minimo, intento e testo con valori in whitelist; un intento sconosciuto è VALIDATION_ERROR", async () => {
    const root = await rootAdminWithKey("t7302-filters");
    const { projectId, topicId } = await projectWithKeywords(root.workspaceId, 30, 5);

    const all = await callTool(root.key, "list_keywords", { projectId, topicId, status: "all", minVolume: 200, search: "magnetoterapia 02" });
    const discarded = await callTool(root.key, "list_keywords", { projectId, status: "discarded" });
    const unknown = await callTool(root.key, "list_keywords", { projectId, searchIntent: "'; DROP TABLE" });

    expect((all.data as unknown as KeywordsPage).keywords.map((row) => row.keyword)).toEqual(
      expect.arrayContaining(["magnetoterapia 020", "magnetoterapia 029"])
    );
    expect((all.data as unknown as KeywordsPage).total).toBe(10);
    expect((discarded.data as unknown as KeywordsPage).total).toBe(5);
    expect(unknown.data).toMatchObject({ code: "VALIDATION_ERROR", field: "searchIntent" });
  });

  it("le keyword di un progetto di un altro workspace non si leggono né si cambiano", async () => {
    const root = await rootAdminWithKey("t7302-foreign");
    const owner = await createUserWithSession({ displayName: "t7302-proprietario" });
    const { projectId } = await projectWithKeywords(owner.workspaceId, 3);
    const ids = (await prisma.keywordCandidate.findMany({ where: { project_id: projectId }, select: { id: true } })).map((row) => row.id);

    const read = await callTool(root.key, "list_keywords", { projectId });
    const write = await callTool(root.key, "set_keywords", { projectId, action: "discard", ids });

    expect(read.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(write.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(await prisma.keywordCandidate.count({ where: { project_id: projectId, review_status: "rejected" } })).toBe(0);
  });
});

describe("tetto giornaliero di spesa di Claude Code", () => {
  // covers: AC-7302-3
  it("con il tetto a 5 $ e 5,20 $ di richieste agent di oggi run_search è AGENT_SPEND_CAP e non nasce nessun lavoro", async () => {
    const root = await rootAdminWithKey("t7302-cap");
    const { projectId, topicId } = await projectWithKeywords(root.workspaceId, 1);
    expect((await patchCap(root.cookie, { dailyCapUsd: 5 })).status).toBe(200);
    await prisma.metricsProviderRequest.createMany({
      data: [
        { provider: "DATAFORSEO", project_id: projectId, keyword_count: 100, estimated_cost_usd: 3.2, agent: true },
        { provider: "DATAFORSEO", project_id: projectId, keyword_count: 100, estimated_cost_usd: 2, agent: true },
        // Di ieri: non conta.
        { provider: "DATAFORSEO", project_id: projectId, keyword_count: 100, estimated_cost_usd: 9, agent: true, created_at: new Date(Date.now() - 86_400_000 * 2) },
      ],
    });

    const { result, data } = await callTool(root.key, "run_search", { projectId, topicId });

    expect(result?.isError).toBe(true);
    expect(data).toMatchObject({ code: "AGENT_SPEND_CAP", spentTodayUsd: 5.2, capUsd: 5 });
    expect(await prisma.job.count()).toBe(0);
    const created = await callTool(root.key, "create_project", { name: "Altro sito", languageCode: "it", countryCode: "IT", seeds: ["scarpe"] });
    expect(created.data).toMatchObject({ code: "AGENT_SPEND_CAP" });
    expect(await prisma.project.count()).toBe(1);
  });

  // covers: AC-7302-4
  it("con 4 $ di un lavoro APP e 1 $ di un lavoro AGENT agentSpendToday vale 1 e run_search parte con origin AGENT", async () => {
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "100");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
    const root = await rootAdminWithKey("t7302-origin");
    const { projectId, topicId } = await projectWithKeywords(root.workspaceId, 1);
    expect((await patchCap(root.cookie, { dailyCapUsd: 5 })).status).toBe(200);
    const app = await paidRequest(projectId, topicId, "APP", 4);
    const agent = await paidRequest(projectId, topicId, "AGENT", 1);

    expect(await agentSpendToday()).toBe(1);
    const requests = await prisma.metricsProviderRequest.findMany({ select: { job_id: true, agent: true } });
    expect(requests).toEqual(expect.arrayContaining([{ job_id: app.id, agent: false }, { job_id: agent.id, agent: true }]));

    const { result, data } = await callTool(root.key, "run_search", { projectId, topicId });

    expect(result?.isError).not.toBe(true);
    expect(data).toMatchObject({ spend: { spentTodayUsd: 1, capUsd: 5 } });
    const job = await prisma.job.findUniqueOrThrow({ where: { id: (data as { jobId: string }).jobId } });
    expect(job.origin).toBe("AGENT");
    expect(scheduleJobContinuation).toHaveBeenCalledWith(job.id);
  });

  it("il tetto si cambia solo dal root admin, da 0 a 100 con due decimali, con la riga agent_key.settings nel registro", async () => {
    const root = await rootAdminWithKey("t7302-settings");
    const subscriber = await createUserWithSession({ displayName: "t7302-abbonato" });

    const saved = await patchCap(root.cookie, { dailyCapUsd: 12.5 });
    const forbidden = await patchCap(subscriber.cookie, { dailyCapUsd: 50 });
    const tooHigh = await patchCap(root.cookie, { dailyCapUsd: 100.01 });
    const decimals = await patchCap(root.cookie, { dailyCapUsd: 1.234 });
    const zero = await patchCap(root.cookie, { dailyCapUsd: 0 });

    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ data: { spentTodayUsd: 0, capUsd: 12.5 } });
    expect(forbidden.status).toBe(403);
    expect(tooHigh.status).toBe(400);
    expect(decimals.status).toBe(400);
    expect(zero.status).toBe(200);
    const audit = await prisma.adminAuditLog.findMany({ where: { action: "agent_key.settings" }, orderBy: { created_at: "asc" } });
    expect(audit.map((row) => row.metadata)).toEqual([{ dailyCapUsd: { before: 2, after: 12.5 } }, { dailyCapUsd: { before: 12.5, after: 0 } }]);
    // Un tetto di 0 ferma ogni avvio di Claude Code.
    const { data } = await callTool(root.key, "create_project", { name: "Sito", languageCode: "it", countryCode: "IT", seeds: ["scarpe"] });
    expect(data).toMatchObject({ code: "AGENT_SPEND_CAP", spentTodayUsd: 0, capUsd: 0 });
  });
});
