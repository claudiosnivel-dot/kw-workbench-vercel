// Gate di T-3803 (AC-3803-1…3): catalogo dei modelli gratuiti di OpenRouter salvato con i soli modelli ':free' a
// prezzo 0, stato dei modelli dell'elenco nella card, modelli assenti saltati dalla proposta e cron notturno protetto
// da CRON_SECRET che, se la lettura non riesce, lascia il catalogo salvato com'era.
import { randomBytes, randomUUID } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as refreshCatalogRoute } from "@/app/api/admin/ai-titles/catalog/route";
import { GET as readAiTitles } from "@/app/api/admin/ai-titles/route";
import { GET as catalogCron } from "@/app/api/cron/ai-catalog/route";
import { readModelCatalog, refreshModelCatalog } from "@/lib/ai/catalog";
import { prisma } from "@/lib/prisma";
import { completion, memberWithPlan, saveAiSettings, stubOpenRouterEnv, suggest } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type View = { models: string[]; statuses: Record<string, string>; addable: { id: string }[]; catalog: { checkedAt: string } | null };

const fetchMock = vi.fn<typeof fetch>();
const H1 = "Scarpe running donna: come sceglierle";

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

const free = { prompt: "0", completion: "0" };

/** Catalogo simulato di OpenRouter (GET /models): a/tre è ':free' di nome ma ha un prezzo. */
const catalogResponse = () =>
  Response.json({
    data: [
      { id: "a/uno:free", name: "A: Uno (free)", context_length: 131072, pricing: free },
      { id: "a/tre:free", name: "A: Tre (free)", context_length: 131072, pricing: { prompt: "0.0000001", completion: "0" } },
      { id: "a/nuovo:free", name: "A: Nuovo (free)", context_length: 65536, pricing: free },
      { id: "a/pagamento", name: "A: Pagamento", context_length: 65536, pricing: { prompt: "0.000002", completion: "0.000004" } },
    ],
  });

/** fetch simulato per indirizzo: il catalogo su /models, i completamenti su /chat/completions. */
function routeFetch(responses: { models: () => Response; chat?: () => Response }) {
  fetchMock.mockImplementation(async (url) => {
    const target = String(url);
    if (target.endsWith("/models")) return responses.models();
    if (target.endsWith("/chat/completions") && responses.chat) return responses.chat();
    throw new Error(`richiesta inattesa: ${target}`);
  });
}

const calls = (suffix: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));
const rootAdmin = () => createUserWithSession({ displayName: `t3803-root-${randomUUID().slice(0, 8)}`, role: UserRole.ADMIN, isRootAdmin: true });

async function readView(cookie: string): Promise<View> {
  return ((await (await callRoute(readAiTitles, { url: "/api/admin/ai-titles", cookie })).json()) as { data: View }).data;
}

describe("catalogo dei modelli gratuiti", () => {
  // covers: AC-3803-1
  it("salva i soli modelli gratuiti a prezzo 0 e segna i modelli dell'elenco come disponibili o assenti", async () => {
    const root = await rootAdmin();
    await saveAiSettings({ models: ["a/uno:free", "a/due:free", "a/tre:free"] });
    routeFetch({ models: catalogResponse });

    const { refreshed } = await refreshModelCatalog();
    const view = await readView(root.cookie);

    expect(refreshed).toBe(true);
    expect(calls("/models")[0][0]).toBe("https://openrouter.test/api/v1/models");
    expect(new Headers(calls("/models")[0][1]?.headers).get("authorization")).toBeNull();
    expect((await readModelCatalog())?.free.map((model) => model.id)).toEqual(["a/uno:free", "a/nuovo:free"]);
    expect(view.statuses).toEqual({ "a/uno:free": "ok", "a/due:free": "missing", "a/tre:free": "missing" });
    expect(view.addable.map((model) => model.id)).toEqual(["a/nuovo:free"]);
    expect(view.catalog?.checkedAt).toEqual(expect.any(String));
  });

  // covers: AC-3803-2
  it("la proposta salta i modelli assenti dal catalogo e chiama solo il primo disponibile", async () => {
    await saveAiSettings({ models: ["a/due:free", "a/uno:free"] });
    const { member, spoke } = await memberWithPlan("t3803");
    routeFetch({ models: catalogResponse, chat: () => completion({ h1: H1, h2: ["Ammortizzazione"] }, "a/uno:free") });
    await refreshModelCatalog();

    const response = await suggest(member.cookie, spoke);
    const body = (await response.json()) as { data?: { model: string } };

    expect(response.status).toBe(200);
    expect(body.data?.model).toBe("a/uno:free");
    expect(calls("/chat/completions")).toHaveLength(1);
    expect(JSON.parse(String(calls("/chat/completions")[0][1]?.body))).toMatchObject({ model: "a/uno:free" });
  });

  // covers: AC-3803-3
  it("il cron con il Bearer giusto risponde 200 e lascia il catalogo se la lettura fallisce; senza Authorization 401", async () => {
    const secret = randomBytes(24).toString("hex");
    vi.stubEnv("CRON_SECRET", secret);
    routeFetch({ models: catalogResponse });
    await refreshModelCatalog(new Date("2026-10-19T04:30:00.000Z"));
    const before = await readModelCatalog();
    routeFetch({ models: () => new Response("errore", { status: 500 }) });

    const authorized = await callRoute(catalogCron, { url: "/api/cron/ai-catalog", headers: { authorization: `Bearer ${secret}` } });
    const anonymous = await callRoute(catalogCron, { url: "/api/cron/ai-catalog" });

    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toMatchObject({ refreshed: false, checkedAt: "2026-10-19T04:30:00.000Z" });
    expect(await readModelCatalog()).toEqual(before);
    expect(anonymous.status).toBe(401);
    expect(calls("/models")).toHaveLength(2);
  });
});

describe("catalogo all'apertura della card", () => {
  it("il root admin rilegge un catalogo vecchio di più di un'ora, non uno recente; gli altri ricevono 403", async () => {
    const root = await rootAdmin();
    const admin = await createUserWithSession({ displayName: "t3803-admin", role: UserRole.ADMIN });
    routeFetch({ models: catalogResponse });
    await refreshModelCatalog(new Date(Date.now() - 2 * 3_600_000));

    const stale = await callRoute(refreshCatalogRoute, { method: "POST", url: "/api/admin/ai-titles/catalog", cookie: root.cookie });
    const fresh = await callRoute(refreshCatalogRoute, { method: "POST", url: "/api/admin/ai-titles/catalog", cookie: root.cookie });
    const forbidden = await callRoute(refreshCatalogRoute, { method: "POST", url: "/api/admin/ai-titles/catalog", cookie: admin.cookie });

    expect([stale.status, fresh.status, forbidden.status]).toEqual([200, 200, 403]);
    expect(stale.headers.get("cache-control")).toBe("no-store");
    expect(Date.now() - Date.parse(((await fresh.json()) as { data: View }).data.catalog?.checkedAt ?? "")).toBeLessThan(60_000);
    expect(calls("/models")).toHaveLength(2);
    expect(await prisma.appSetting.count({ where: { key: "AI_MODEL_CATALOG" } })).toBe(1);
  });
});
