// Gate di T-3801 (AC-3801-1, AC-3801-2): elenco ordinato dei modelli gratuiti nelle impostazioni dei titoli con l'AI.
// Un valore salvato con il solo model si legge come elenco di un modello; la PATCH accetta da 1 a 8 ID ':free' distinti
// e registra l'elenco prima e dopo nella riga ai.update.
// Gate di T-6403 (AC-6403-1, AC-6403-2): con tutti i modelli dell'elenco assenti dal catalogo la proposta usa i modelli
// predefiniti ancora gratuiti; senza nessuno risponde 503 AI_NO_MODELS senza chiamare OpenRouter.
import { randomBytes } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAiTitles, PATCH as updateAiTitles } from "@/app/api/admin/ai-titles/route";
import { DEFAULT_AI_MODELS } from "@/lib/ai/models";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { completion, insertPlan, memberWithPlan, pageRow, saveAiSettings, stubOpenRouterEnv, suggest } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type SettingsBody = { data: { enabled: boolean; models: string[]; platformDailyRequests: number }; code?: string };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

const rootAdmin = () => createUserWithSession({ displayName: "t3801-root", role: UserRole.ADMIN, isRootAdmin: true });

async function read(cookie: string): Promise<SettingsBody["data"]> {
  const response = await callRoute(readAiTitles, { url: "/api/admin/ai-titles", cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as SettingsBody).data;
}

function update(cookie: string, body: unknown) {
  return callRoute(updateAiTitles, { method: "PATCH", url: "/api/admin/ai-titles", cookie, body });
}

describe("elenco dei modelli dei titoli con l'AI", () => {
  // covers: AC-3801-1
  it("un valore salvato con il solo model si legge come l'elenco di quel modello", async () => {
    const root = await rootAdmin();
    await upsertSettingValue({
      key: "AI_TITLES_SETTINGS",
      value: JSON.stringify({ enabled: true, model: "autore/a:free", platformDailyLimit: 45, workspaceDailyLimit: 10 }),
    });

    const settings = await read(root.cookie);

    expect(settings.models).toEqual(["autore/a:free"]);
    expect(settings).not.toHaveProperty("model");
    expect(settings.enabled).toBe(true);
  });

  // covers: AC-3801-2
  it("salva l'ordine con ai.update e rifiuta un ID non gratuito, 9 modelli e i doppioni senza cambiare le impostazioni", async () => {
    const root = await rootAdmin();
    const before = await read(root.cookie);
    const ordered = ["autore/c:free", "autore/a:free", "autore/b:free"];

    const saved = await update(root.cookie, { models: ordered });
    const afterSave = await read(root.cookie);
    const paid = await update(root.cookie, { models: ["autore/c:free", "autore/d"] });
    const nine = await update(root.cookie, { models: Array.from({ length: 9 }, (_, index) => `autore/m${index}:free`) });
    const duplicate = await update(root.cookie, { models: ["autore/a:free", "Autore/A:free"] });
    const legacy = await update(root.cookie, { model: "autore/a:free" });

    expect(saved.status).toBe(200);
    expect(afterSave.models).toEqual(ordered);
    expect([paid.status, ((await paid.json()) as SettingsBody).code]).toEqual([400, "AI_MODEL_NOT_FREE"]);
    expect([nine.status, ((await nine.json()) as SettingsBody).code]).toEqual([400, "VALIDATION_ERROR"]);
    expect([duplicate.status, ((await duplicate.json()) as SettingsBody).code]).toEqual([400, "VALIDATION_ERROR"]);
    expect([legacy.status, ((await legacy.json()) as SettingsBody).code]).toEqual([400, "VALIDATION_ERROR"]);
    expect((await read(root.cookie)).models).toEqual(ordered);

    const rows = await prisma.adminAuditLog.findMany({ where: { action: "ai.update" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_user_id: root.user.id, target_type: "ai" });
    expect(rows[0].metadata).toEqual({ models: { before: before.models, after: ordered } });
  });

  it("lo stesso elenco in un altro ordine è un cambiamento; lo stesso ordine non scrive nulla", async () => {
    const root = await rootAdmin();
    await update(root.cookie, { models: ["autore/a:free", "autore/b:free"] });
    await update(root.cookie, { models: ["autore/a:free", "autore/b:free"] });
    await update(root.cookie, { models: ["autore/b:free", "autore/a:free"] });

    const rows = await prisma.adminAuditLog.findMany({ where: { action: "ai.update" }, orderBy: { created_at: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[1].metadata).toEqual({ models: { before: ["autore/a:free", "autore/b:free"], after: ["autore/b:free", "autore/a:free"] } });
  });
});

describe("elenco con tutti i modelli spariti dal catalogo gratuito", () => {
  const X = "autore/sparito:free";
  const [P, Q] = DEFAULT_AI_MODELS;
  const fetchMock = vi.fn<typeof fetch>();
  const sentModels = () => fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { model: string }).model);

  beforeEach(() => {
    stubOpenRouterEnv();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    return () => vi.unstubAllGlobals();
  });

  /** Catalogo salvato come lo salva refreshModelCatalog, con i soli modelli indicati. */
  async function saveCatalog(ids: string[]) {
    const free = ids.map((id) => ({ id, name: id, contextLength: 131072, reasoning: false }));
    await upsertSettingValue({ key: "AI_MODEL_CATALOG", value: JSON.stringify({ checkedAt: new Date().toISOString(), free }) });
  }

  // covers: AC-6403-1
  it("usa i modelli predefiniti ancora nel catalogo, nell'ordine, senza chiamare quelli spariti", async () => {
    await saveAiSettings({ models: [X] });
    await saveCatalog([Q, "autore/altro:free"]);
    const { member, spoke } = await memberWithPlan("t6403");
    fetchMock.mockResolvedValueOnce(completion({ h1: "Scarpe running donna: come sceglierle", h2: ["Ammortizzazione"] }, Q));

    const response = await suggest(member.cookie, spoke);

    expect(response.status).toBe(200);
    expect((await pageRow(spoke.pageId)).ai_proposal).toMatchObject({ model: Q });
    expect(sentModels()).toEqual([Q]);
    expect(sentModels()).not.toContain(X);
    expect(sentModels()).not.toContain(P);
  });

  // covers: AC-6403-2
  it("senza modelli predefiniti nel catalogo risponde 503 AI_NO_MODELS senza chiamare OpenRouter; il root admin ha il link alla card", async () => {
    await saveAiSettings({ models: [X] });
    await saveCatalog(["autore/altro:free"]);
    const { member, spoke } = await memberWithPlan("t6403");
    const root = await createUserWithSession({ displayName: "t6403-root", role: UserRole.ADMIN, isRootAdmin: true });
    const rootPlan = await insertPlan(root);

    const response = await suggest(member.cookie, spoke);
    const body = (await response.json()) as { code?: string; cardHref?: string };
    const rootResponse = await suggest(root.cookie, { projectId: rootPlan.projectId, strategyId: rootPlan.strategyId, pageId: rootPlan.pageIds.spoke });

    expect([response.status, body.code]).toEqual([503, "AI_NO_MODELS"]);
    expect(body).not.toHaveProperty("cardHref");
    expect(rootResponse.status).toBe(503);
    expect(await rootResponse.json()).toMatchObject({ code: "AI_NO_MODELS", cardHref: "/admin/settings#ai-titles" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.aiRequest.count()).toBe(0);
  });
});
