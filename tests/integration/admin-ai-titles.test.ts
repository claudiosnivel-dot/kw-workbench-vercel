// Gate di T-3501 (AC-3501-1…3): impostazioni dei titoli con l'AI del solo root admin, con la chiave di OpenRouter mai
// nelle risposte, il solo modello gratuito accettato e una riga ai.update del registro per ogni salvataggio.
import { randomBytes } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAiTitles, PATCH as updateAiTitles } from "@/app/api/admin/ai-titles/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type SettingsBody = {
  data: {
    enabled: boolean;
    models: string[];
    platformDailyRequests: number;
    workspaceDailyLimit: number;
    keyConfigured: boolean;
    usage: { requests24h: number; limit: number };
  };
  code?: string;
};

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-3501");
  await resetDatabase();
});

function read(cookie: string | undefined) {
  return callRoute(readAiTitles, { url: "/api/admin/ai-titles", cookie });
}

function update(cookie: string | undefined, body: unknown) {
  return callRoute(updateAiTitles, { method: "PATCH", url: "/api/admin/ai-titles", cookie, body });
}

async function rootAdmin() {
  return createUserWithSession({ displayName: "t3501-root", role: UserRole.ADMIN, isRootAdmin: true });
}

describe("impostazioni dei titoli con l'AI", () => {
  // covers: AC-3501-1
  // impacted-by: T-3801 (elenco dei modelli al posto del modello unico: AC-3501-1 emendato)
  // impacted-by: T-3901 e T-3902 (tetto in richieste platformDailyRequests 900 e usage.requests24h al posto di used24h)
  it("senza impostazioni salvate restituisce i default spenti, no-store, e la chiave solo come sì o no", async () => {
    const root = await rootAdmin();

    const response = await read(root.cookie);
    const text = await response.text();
    const body = JSON.parse(text) as SettingsBody;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({
      enabled: false,
      platformDailyRequests: 900,
      workspaceDailyLimit: 10,
      keyConfigured: true,
      usage: { requests24h: 0, limit: 900 },
    });
    expect(body.data.models.length).toBeGreaterThanOrEqual(5);
    expect(body.data.models.every((model) => model.endsWith(":free"))).toBe(true);
    expect(text).not.toContain("sk-or-test-3501");
  });

  // covers: AC-3501-2
  // impacted-by: T-3801 (la PATCH riceve models, l'elenco ordinato: AC-3501-2 emendato)
  // impacted-by: T-3901 (platformDailyRequests al posto di platformDailyLimit)
  it("salva il modello gratuito e i limiti, rifiuta un modello a pagamento e un limite fuori intervallo, registra ai.update", async () => {
    const root = await rootAdmin();
    const before = ((await (await read(root.cookie)).json()) as SettingsBody).data;

    const saved = await update(root.cookie, { enabled: true, models: ["autore/modello-prova:free"], platformDailyRequests: 40 });
    const paid = await update(root.cookie, { models: ["autore/modello-a-pagamento"] });
    const outOfRange = await update(root.cookie, { workspaceDailyLimit: 0 });

    expect([saved.status, paid.status, outOfRange.status]).toEqual([200, 400, 400]);
    expect(((await paid.json()) as SettingsBody).code).toBe("AI_MODEL_NOT_FREE");
    expect(((await outOfRange.json()) as SettingsBody).code).toBe("VALIDATION_ERROR");

    const after = ((await (await read(root.cookie)).json()) as SettingsBody).data;
    expect(after).toMatchObject({ enabled: true, models: ["autore/modello-prova:free"], platformDailyRequests: 40, workspaceDailyLimit: 10 });

    const rows = await prisma.adminAuditLog.findMany({ where: { action: "ai.update" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_user_id: root.user.id, target_type: "ai" });
    expect(rows[0].metadata).toEqual({
      enabled: { before: false, after: true },
      models: { before: before.models, after: ["autore/modello-prova:free"] },
      platformDailyRequests: { before: 900, after: 40 },
    });
  });

  // impacted-by: T-3901 (il tetto conta le righe di ai_requests, non i tentativi del rate limit)
  it("conta nelle ultime 24 ore solo le richieste di ai_requests degli utenti, senza quelle del root admin", async () => {
    const root = await rootAdmin();
    const now = Date.now();
    const row = (minutesAgo: number, byRootAdmin = false) => ({
      feature: "titles" as const,
      model: "autore/modello-prova:free",
      outcome: "ok" as const,
      http_status: 200,
      duration_ms: 1000,
      by_root_admin: byRootAdmin,
      created_at: new Date(now - minutesAgo * 60_000),
    });
    await prisma.aiRequest.createMany({ data: [row(1), row(2, true), row(25 * 60)] });

    const body = (await (await read(root.cookie)).json()) as SettingsBody;

    expect(body.data.usage).toMatchObject({ requests24h: 1, limit: 900 });
  });

  it("rifiuta platformDailyLimit, il campo di prima del tetto in richieste, e un tetto oltre 5000", async () => {
    const root = await rootAdmin();

    const legacy = await update(root.cookie, { platformDailyLimit: 40 });
    const tooHigh = await update(root.cookie, { platformDailyRequests: 5001 });
    const highest = await update(root.cookie, { platformDailyRequests: 5000 });

    expect([legacy.status, tooHigh.status, highest.status]).toEqual([400, 400, 200]);
    expect(((await legacy.json()) as SettingsBody).code).toBe("VALIDATION_ERROR");
    expect(((await highest.json()) as SettingsBody).data.platformDailyRequests).toBe(5000);
  });
});

describe("accesso alle impostazioni dei titoli con l'AI", () => {
  // covers: AC-3501-3
  it("admin non root e sottoscrittore ricevono 403, senza sessione 401, e le impostazioni non cambiano", async () => {
    const admin = await createUserWithSession({ displayName: "t3501-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t3501-sottoscrittore" });
    const cookies = [admin.cookie, subscriber.cookie, undefined];

    const reads = await Promise.all(cookies.map(async (cookie) => (await read(cookie)).status));
    const writes = [];
    for (const cookie of cookies) {
      writes.push((await update(cookie, { enabled: true })).status);
    }

    expect(reads).toEqual([403, 403, 401]);
    expect(writes).toEqual([403, 403, 401]);
    expect(await prisma.appSetting.count({ where: { key: "AI_TITLES_SETTINGS" } })).toBe(0);
    expect(await prisma.adminAuditLog.count({ where: { action: "ai.update" } })).toBe(0);
  });
});
