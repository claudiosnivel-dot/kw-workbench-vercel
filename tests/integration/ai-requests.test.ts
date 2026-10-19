// Gate di T-3901 (AC-3901-1…3): ogni tentativo verso OpenRouter scrive una riga di ai_requests con i soli metadati, il
// tetto della piattaforma conta le righe delle ultime 24 ore senza quelle del root admin e il cron del catalogo elimina
// le righe più vecchie di 30 giorni. Fetch di OpenRouter simulato, nessuna chiamata reale.
import { randomBytes, randomUUID } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAiTitles } from "@/app/api/admin/ai-titles/route";
import { GET as catalogCron } from "@/app/api/cron/ai-catalog/route";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { completion, insertPlan, memberWithPlan, saveAiSettings, stubOpenRouterEnv, suggest } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const A = "autore/a:free";
const B = "autore/b:free";
const H1 = "Scarpe running donna: come sceglierle";
const MAIN_KEYWORD = "scarpe running donna";
const MINUTE = 60_000;
const DAY = 86_400_000;

const fetchMock = vi.fn<typeof fetch>();

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
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** 429 del fornitore sovraccarico, nel formato di OpenRouter: il fornitore nei metadati dell'errore. */
const providerBusy = () =>
  Response.json(
    { error: { code: 429, message: "Provider returned error", metadata: { provider_name: "Google AI Studio", raw: "rate-limited upstream" } } },
    { status: 429 }
  );

/** Riga di ai_requests creata minutesAgo minuti fa, di un utente qualsiasi salvo indicazione contraria. */
function requestRow(minutesAgo: number, fields: { byRootAdmin?: boolean } = {}) {
  return {
    feature: "titles" as const,
    model: A,
    outcome: "ok" as const,
    http_status: 200,
    duration_ms: 2000,
    by_root_admin: fields.byRootAdmin ?? false,
    created_at: new Date(Date.now() - minutesAgo * MINUTE),
  };
}

const rootAdmin = () => createUserWithSession({ displayName: `t3901-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });

describe("registro delle richieste a OpenRouter", () => {
  // covers: AC-3901-1
  it("scrive una riga per tentativo con funzione, modello, esito, status e workspace, senza la keyword della pagina", async () => {
    await saveAiSettings({ models: [A, B] });
    const { owner, member, spoke } = await memberWithPlan("t3901");
    fetchMock.mockResolvedValueOnce(providerBusy()).mockResolvedValueOnce(completion({ h1: H1, h2: ["Ammortizzazione"] }, B));

    const response = await suggest(member.cookie, spoke);

    expect(response.status).toBe(200);
    const rows = await prisma.aiRequest.findMany({ orderBy: { created_at: "asc" } });
    expect(rows.map(({ feature, model, outcome, http_status, workspace_id, by_root_admin }) => ({ feature, model, outcome, http_status, workspace_id, by_root_admin }))).toEqual([
      { feature: "titles", model: A, outcome: "provider_busy", http_status: 429, workspace_id: owner.workspaceId, by_root_admin: false },
      { feature: "titles", model: B, outcome: "ok", http_status: 200, workspace_id: owner.workspaceId, by_root_admin: false },
    ]);
    expect(rows.every((row) => Number.isInteger(row.duration_ms) && row.duration_ms >= 0)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(MAIN_KEYWORD);
    expect(JSON.stringify(rows)).not.toContain("Google AI Studio");
  });

  it("scrive anche i tentativi del root admin, segnati by_root_admin", async () => {
    await saveAiSettings({ models: [A] });
    const root = await rootAdmin();
    const plan = await insertPlan(root);
    fetchMock.mockImplementation(async () => completion({ h1: H1, h2: ["Ammortizzazione"] }, A));

    const response = await suggest(root.cookie, { projectId: plan.projectId, strategyId: plan.strategyId, pageId: plan.pageIds.spoke });

    expect(response.status).toBe(200);
    expect(await prisma.aiRequest.findMany({ select: { outcome: true, workspace_id: true, by_root_admin: true } })).toEqual([
      { outcome: "ok", workspace_id: root.workspaceId, by_root_admin: true },
    ]);
  });
});

describe("tetto della piattaforma in richieste", () => {
  // covers: AC-3901-2
  it("al tetto il MEMBER riceve 429 RATE_LIMITED con Retry-After senza chiamare OpenRouter, il root admin 200", async () => {
    await saveAiSettings({ models: [A], platformDailyRequests: 3 });
    await prisma.aiRequest.createMany({ data: [requestRow(10), requestRow(30), requestRow(50)] });
    const { member, spoke } = await memberWithPlan("t3901");
    const root = await rootAdmin();
    const rootPlan = await insertPlan(root);

    const limited = await suggest(member.cookie, spoke);
    const limitedBody = (await limited.json()) as { code?: string; retryAfter?: number };
    expect([limited.status, limitedBody.code]).toEqual([429, "RATE_LIMITED"]);
    // La richiesta torna ammessa quando esce dalla finestra la riga più vecchia, di 50 minuti fa.
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(DAY / 1000 - 50 * 60 - 60);
    expect(retryAfter).toBeLessThanOrEqual(DAY / 1000 - 50 * 60);
    expect(limitedBody.retryAfter).toBe(retryAfter);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async () => completion({ h1: H1, h2: ["Ammortizzazione"] }, A));
    const rootResponse = await suggest(root.cookie, { projectId: rootPlan.projectId, strategyId: rootPlan.strategyId, pageId: rootPlan.pageIds.spoke });
    expect(rootResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("non contano le righe del root admin né quelle oltre le 24 ore", async () => {
    await saveAiSettings({ models: [A], platformDailyRequests: 2 });
    await prisma.aiRequest.createMany({ data: [requestRow(5), requestRow(6, { byRootAdmin: true }), requestRow(25 * 60)] });
    const { member, spoke } = await memberWithPlan("t3901");
    fetchMock.mockImplementation(async () => completion({ h1: H1, h2: ["Ammortizzazione"] }, A));

    const allowed = await suggest(member.cookie, spoke);
    const limited = await suggest(member.cookie, spoke);

    expect([allowed.status, limited.status]).toEqual([200, 429]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un valore salvato con il solo platformDailyLimit in proposte ha il tetto predefinito di 900 richieste", async () => {
    const root = await rootAdmin();
    await upsertSettingValue({
      key: "AI_TITLES_SETTINGS",
      value: JSON.stringify({ enabled: true, models: [A], platformDailyLimit: 45, workspaceDailyLimit: 10 }),
    });

    const response = await callRoute(readAiTitles, { url: "/api/admin/ai-titles", cookie: root.cookie });
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(body.data).toMatchObject({ platformDailyRequests: 900, workspaceDailyLimit: 10 });
    expect(body.data).not.toHaveProperty("platformDailyLimit");
  });
});

describe("conservazione del registro", () => {
  // covers: AC-3901-3
  it("il cron del catalogo con il Bearer giusto elimina le righe di 31 giorni fa e lascia quelle di 2 giorni fa", async () => {
    const secret = randomBytes(24).toString("hex");
    vi.stubEnv("CRON_SECRET", secret);
    fetchMock.mockImplementation(async () => Response.json({ data: [{ id: "a/uno:free", name: "A: Uno", context_length: 8192, pricing: { prompt: "0", completion: "0" } }] }));
    await prisma.aiRequest.createMany({ data: [requestRow(31 * 24 * 60), requestRow(2 * 24 * 60), requestRow(2 * 24 * 60 + 5)] });

    const response = await callRoute(catalogCron, { url: "/api/cron/ai-catalog", headers: { authorization: `Bearer ${secret}` } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ refreshed: true, prunedRequests: 1 });
    const left = await prisma.aiRequest.findMany({ select: { created_at: true } });
    expect(left).toHaveLength(2);
    expect(left.every((row) => Date.now() - row.created_at.getTime() < 3 * DAY)).toBe(true);
  });
});
