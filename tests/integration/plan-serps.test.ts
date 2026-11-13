// Gate di T-6101 (AC-6101-1…AC-6101-4, D-57): i primi 10 risultati organici di Google delle keyword chiesti a DataForSEO
// in coda priority, salvati per 30 giorni in keyword_serps, con i tetti di spesa del registro (T-903). Fetch di
// DataForSEO simulato, nessuna chiamata reale (D-30).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { collectSerps, type PlanDataContext, readFreshSerps, requestSerps } from "@/lib/modules/plan-data/serps";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const MAIN = "noleggio magnetoterapia";
const COST = "noleggio magnetoterapia costo";
const DAY_MS = 86_400_000;

type PostedTask = { keyword: string; language_code: string; location_code: number; priority: number; depth: number };

const api = vi.hoisted(() => ({
  posted: [] as { keyword: string; language_code: string; location_code: number; priority: number; depth: number }[][],
  /** Keyword di ogni task creato, per id. */
  taskKeywords: new Map<string, string>(),
}));

/** 12 risultati in ordine sparso: 11 organic e 1 people_also_ask al rank 3. */
function serpItems(keyword: string) {
  const slug = keyword.replaceAll(" ", "-");
  const items = Array.from({ length: 12 }, (_, index) => {
    const rank = index + 1;
    return rank === 3
      ? { type: "people_also_ask", rank_group: 1, rank_absolute: rank, url: null }
      : { type: "organic", rank_group: rank, rank_absolute: rank, url: `https://sito-${rank}.example/${slug}`, domain: `sito-${rank}.example` };
  });
  return [...items.slice(6), ...items.slice(0, 6)];
}

/** I 10 URL organic attesi: rank da 1 a 11 senza il 3. */
function expectedUrls(keyword: string): string[] {
  const slug = keyword.replaceAll(" ", "-");
  return [1, 2, 4, 5, 6, 7, 8, 9, 10, 11].map((rank) => `https://sito-${rank}.example/${slug}`);
}

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/v3/serp/google/organic/task_post")) {
    const tasks = JSON.parse(String(init?.body)) as PostedTask[];
    api.posted.push(tasks);
    return Response.json({
      status_code: 20000,
      cost: 0.0012 * tasks.length,
      tasks: tasks.map((task, index) => {
        const id = `serp-${api.posted.length}-${index}`;
        api.taskKeywords.set(id, task.keyword);
        return { id, status_code: 20100, cost: 0.0012, data: task, result: null };
      }),
    });
  }
  if (url.endsWith("/v3/serp/google/organic/tasks_ready")) {
    const ready = [...api.taskKeywords.keys()].map((id) => ({ id, se: "google", se_type: "organic" }));
    return Response.json({ status_code: 20000, cost: 0, tasks: [{ id: "ready", status_code: 20000, cost: 0, result: ready }] });
  }
  const id = url.match(/\/task_get\/regular\/([^/?]+)$/)?.[1];
  if (id && api.taskKeywords.has(id)) {
    const keyword = api.taskKeywords.get(id) as string;
    return Response.json({
      status_code: 20000,
      cost: 0,
      tasks: [{ id, status_code: 20000, cost: 0, result: [{ keyword, items: serpItems(keyword) }] }],
    });
  }
  return new Response("{}", { status: 404 });
});

function item(keyword: string) {
  return { displayKeyword: keyword, canonical: canonicalizeKeyword(keyword, "it") };
}

async function rootAdminContext(): Promise<PlanDataContext> {
  const { user, workspaceId } = await createUserWithSession({ isRootAdmin: true });
  return { languageCode: "it", countryCode: "IT", actor: { isRootAdmin: user.is_root_admin }, workspaceId };
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
  resetEnvForTests();
  api.posted.length = 0;
  api.taskKeywords.clear();
  fetchMock.mockClear();
});

describe("risultati di Google delle keyword", () => {
  // covers: AC-6101-1
  it("invia i task in coda priority, salva i primi 10 URL organic e registra la spesa", async () => {
    const context = await rootAdminContext();

    const requested = await requestSerps([item(MAIN), item(COST)], context);
    const collected = await collectSerps(requested.tasks, context);

    expect(api.posted).toHaveLength(1);
    expect(api.posted[0]).toEqual([
      { keyword: MAIN, language_code: "it", location_code: 2380, priority: 2, depth: 10 },
      { keyword: COST, language_code: "it", location_code: 2380, priority: 2, depth: 10 },
    ]);
    expect(requested.tasks).toHaveLength(2);
    expect(collected).toMatchObject({ pending: [], failed: [] });
    expect(collected.saved.sort()).toEqual([item(MAIN).canonical, item(COST).canonical].sort());

    const rows = await prisma.keywordSerp.findMany({ orderBy: { canonical_keyword: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => ({ language: row.language_code, country: row.country_code, keyword: row.canonical_keyword, urls: row.urls }))).toEqual([
      { language: "it", country: "IT", keyword: item(MAIN).canonical, urls: expectedUrls(MAIN) },
      { language: "it", country: "IT", keyword: item(COST).canonical, urls: expectedUrls(COST) },
    ]);

    const requests = await prisma.metricsProviderRequest.findMany();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: "DATAFORSEO", status: "completed", keyword_count: 2, provider_code: 20000 });
    expect(Number(requests[0].estimated_cost_usd)).toBeCloseTo(0.0024, 4);
    expect(Number(requests[0].cost_usd)).toBeCloseTo(0.0024, 4);
    expect(requested.costUsd).toBeCloseTo(0.0024, 4);
  });

  // covers: AC-6101-2
  it("riusa i risultati di meno di 30 giorni e chiede solo quelli più vecchi", async () => {
    const context = await rootAdminContext();
    const now = Date.now();
    await prisma.keywordSerp.createMany({
      data: [
        { language_code: "it", country_code: "IT", canonical_keyword: item(MAIN).canonical, urls: ["https://a.example/"], fetched_at: new Date(now - 10 * DAY_MS) },
        { language_code: "it", country_code: "IT", canonical_keyword: item(COST).canonical, urls: ["https://b.example/"], fetched_at: new Date(now - 31 * DAY_MS) },
      ],
    });

    const fresh = await readFreshSerps([item(MAIN).canonical, item(COST).canonical], context);
    const requested = await requestSerps([item(MAIN), item(COST)], context);

    expect([...fresh.entries()]).toEqual([[item(MAIN).canonical, ["https://a.example/"]]]);
    expect([...requested.fresh.keys()]).toEqual([item(MAIN).canonical]);
    expect(api.posted).toHaveLength(1);
    expect(api.posted[0].map((task) => task.keyword)).toEqual([COST]);
    expect(requested.tasks.map((task) => task.canonical)).toEqual([item(COST).canonical]);
  });

  // covers: AC-6101-3
  it("con il tetto mensile raggiunto non chiama DataForSEO e restituisce METRICS_BUDGET_EXCEEDED", async () => {
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "1.00");
    const context = await rootAdminContext();
    await prisma.metricsProviderRequest.create({
      data: { provider: "DATAFORSEO", keyword_count: 1000, cost_usd: 1, estimated_cost_usd: 1, status: "completed" },
    });

    const requested = await requestSerps([item(MAIN)], context);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(requested.notice).toBe("METRICS_BUDGET_EXCEEDED");
    expect(requested.tasks).toEqual([]);
    expect(await prisma.keywordSerp.count()).toBe(0);
    expect(await prisma.metricsProviderRequest.count()).toBe(1);
  });

  // covers: AC-6101-4
  it("senza DATAFORSEO_LOGIN non chiama DataForSEO e restituisce PROVIDER_NOT_CONFIGURED", async () => {
    vi.stubEnv("DATAFORSEO_LOGIN", "");
    const context = await rootAdminContext();

    const requested = await requestSerps([item(MAIN)], context);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(requested.notice).toBe("PROVIDER_NOT_CONFIGURED");
    expect(requested.tasks).toEqual([]);
    expect(await prisma.metricsProviderRequest.count()).toBe(0);
  });

  it("un task ancora in coda resta in attesa e chi non ha i dati con licenza non chiama DataForSEO", async () => {
    const context = await rootAdminContext();
    const requested = await requestSerps([item(MAIN)], context);
    const [task] = requested.tasks;
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ status_code: 20000, tasks: [{ id: "ready", status_code: 20000, result: [] }] })
    );

    const waiting = await collectSerps(requested.tasks, context);
    const { workspaceId } = await createUserWithSession();
    fetchMock.mockClear();
    const unlicensed = await requestSerps([item(COST)], { ...context, actor: { isRootAdmin: false }, workspaceId });

    expect(waiting).toMatchObject({ saved: [], pending: [task], failed: [] });
    expect(unlicensed.notice).toBe("PLAN_NO_LICENSED_METRICS");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
