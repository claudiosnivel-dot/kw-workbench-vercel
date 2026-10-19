// Gate di T-3902 (AC-3902-1, AC-3902-3): GET /api/admin/ai-titles restituisce al root admin l'uso di ogni modello con
// righe di ai_requests negli ultimi 7 giorni, sulle ultime 24 ore e sugli ultimi 7 giorni; all'admin non root 403 senza
// usage. In più i dati degli avvisi della Panoramica letti dal DB (T-3902, T-3903).
import { randomBytes, randomUUID } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAiTitles } from "@/app/api/admin/ai-titles/route";
import { getAdminAlertsData } from "@/lib/admin/alerts";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { saveAiSettings } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type Counts = { requests: number; ok: number; providerBusy: number; accountDailyLimit: number; other: number; avgOkMs: number | null };
type UsageBody = { data?: { usage: { models: { model: string; last24h: Counts; last7d: Counts }[]; requests24h: number; limit: number } } };

const UNO = "a/uno:free";
const DUE = "a/due:free";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

type Outcome = "ok" | "provider_busy" | "account_daily_limit" | "timeout";

/** Riga di ai_requests di un modello, con esito, durata ed età. */
function row(model: string, outcome: Outcome, agoMs: number, durationMs = 1000) {
  return {
    feature: "titles" as const,
    model,
    outcome,
    http_status: outcome === "ok" ? 200 : outcome === "timeout" ? null : 429,
    duration_ms: durationMs,
    created_at: new Date(Date.now() - agoMs),
  };
}

const read = (cookie: string) => callRoute(readAiTitles, { url: "/api/admin/ai-titles", cookie });

describe("uso dei modelli per il root admin", () => {
  // covers: AC-3902-1
  it("per ogni modello conta richieste, ok, fornitore occupato e durata media sulle 24 ore e sui 7 giorni", async () => {
    const root = await createUserWithSession({ displayName: `t3902-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });
    await prisma.aiRequest.createMany({
      data: [
        row(UNO, "ok", HOUR, 2000),
        row(UNO, "ok", 2 * HOUR, 4000),
        row(UNO, "ok", 3 * HOUR, 3000),
        row(UNO, "provider_busy", 4 * HOUR),
        row(DUE, "ok", 3 * DAY, 5000),
        row(DUE, "ok", 3 * DAY + HOUR, 7000),
        row(DUE, "ok", 8 * DAY),
      ],
    });

    const response = await read(root.cookie);
    const body = (await response.json()) as UsageBody;

    expect(response.status).toBe(200);
    const usage = body.data?.usage;
    expect(usage?.models.map((entry) => entry.model)).toEqual([UNO, DUE]);
    const uno = usage?.models.find((entry) => entry.model === UNO);
    const due = usage?.models.find((entry) => entry.model === DUE);
    expect(uno?.last24h).toEqual({ requests: 4, ok: 3, providerBusy: 1, accountDailyLimit: 0, other: 0, avgOkMs: 3000 });
    expect(uno?.last7d).toEqual(uno?.last24h);
    expect(due?.last24h).toEqual({ requests: 0, ok: 0, providerBusy: 0, accountDailyLimit: 0, other: 0, avgOkMs: null });
    expect(due?.last7d).toMatchObject({ requests: 2, ok: 2, avgOkMs: 6000 });
    expect(usage).toMatchObject({ requests24h: 4, limit: 900 });
  });

  it("conta il limite giornaliero e gli altri esiti a parte", async () => {
    const root = await createUserWithSession({ displayName: `t3902-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });
    await prisma.aiRequest.createMany({ data: [row(UNO, "account_daily_limit", HOUR), row(UNO, "timeout", 2 * HOUR)] });

    const body = (await (await read(root.cookie)).json()) as UsageBody;

    expect(body.data?.usage.models[0].last24h).toEqual({ requests: 2, ok: 0, providerBusy: 0, accountDailyLimit: 1, other: 1, avgOkMs: null });
  });

  // covers: AC-3902-3
  it("l'admin non root riceve 403 e la risposta non contiene usage", async () => {
    const admin = await createUserWithSession({ displayName: `t3902-admin-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN });
    await prisma.aiRequest.createMany({ data: [row(UNO, "ok", HOUR)] });

    const response = await read(admin.cookie);
    const text = await response.text();

    expect(response.status).toBe(403);
    expect(text).not.toContain("usage");
    expect(text).not.toContain(UNO);
  });
});

describe("dati degli avvisi della Panoramica", () => {
  it("leggono il limite giornaliero delle ultime 24 ore, lo stato dei modelli e le richieste DataForSEO non riuscite", async () => {
    await saveAiSettings({ models: [UNO, DUE, "a/assente:free"] });
    await upsertSettingValue({
      key: "AI_MODEL_CATALOG",
      value: JSON.stringify({ checkedAt: new Date().toISOString(), free: [UNO, DUE].map((id) => ({ id, name: id, contextLength: null })) }),
    });
    await prisma.aiRequest.createMany({ data: [row(UNO, "account_daily_limit", 2 * HOUR)] });
    const request = (agoMs: number, status: "completed" | "failed", providerCode: number | null) => ({
      provider: "DATAFORSEO" as const,
      keyword_count: 10,
      estimated_cost_usd: 0.075,
      status,
      provider_code: providerCode,
      created_at: new Date(Date.now() - agoMs),
    });
    await prisma.metricsProviderRequest.createMany({
      data: [request(3 * HOUR, "failed", 40100), request(HOUR, "failed", 40104), request(30 * 60_000, "completed", 20000), request(2 * DAY, "failed", 40200)],
    });

    expect(await getAdminAlertsData()).toEqual({
      aiDailyLimit: true,
      aiModelStatuses: ["ok", "ok", "missing"],
      dataForSeo: { failed: 2, lastCode: 40104 },
    });
  });

  it("senza righe recenti non c'è il limite giornaliero e DataForSEO non ha richieste non riuscite", async () => {
    await prisma.aiRequest.createMany({ data: [row(UNO, "account_daily_limit", 25 * HOUR)] });

    const data = await getAdminAlertsData();

    expect(data.aiDailyLimit).toBe(false);
    expect(data.dataForSeo).toEqual({ failed: 0, lastCode: null });
    // Catalogo mai letto: i modelli dell'elenco predefinito sono tutti da verificare.
    expect(data.aiModelStatuses.every((status) => status === "unknown")).toBe(true);
  });
});
