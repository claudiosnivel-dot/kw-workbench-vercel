// Gate di T-3801 (AC-3801-1, AC-3801-2): elenco ordinato dei modelli gratuiti nelle impostazioni dei titoli con l'AI.
// Un valore salvato con il solo model si legge come elenco di un modello; la PATCH accetta da 1 a 8 ID ':free' distinti
// e registra l'elenco prima e dopo nella riga ai.update.
import { randomBytes } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAiTitles, PATCH as updateAiTitles } from "@/app/api/admin/ai-titles/route";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
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
