// Gate di T-903 (AC-903-1…AC-903-4): tetti di spesa del fornitore di metriche, registro delle richieste e
// spesa del mese per il root admin. Fetch del fornitore simulato, nessuna chiamata reale (D-30).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getMetricsSpend } from "@/app/api/admin/metrics-spend/route";
import { UserRole } from "@/lib/generated/prisma/client";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

// Suggerimenti di autocomplete controllati: il numero di candidate di ogni sezione lo decide il test.
const autocomplete = vi.hoisted(() => ({ suggestionsBySeed: new Map<string, string[]>() }));

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      (autocomplete.suggestionsBySeed.get(query) ?? []).map((keyword) => ({
        keyword,
        source: "mock-autocomplete",
        sourceQuery: query,
      })),
  }),
}));

const dataForSeoCalls: string[][] = [];

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  if (!String(input).includes("api.dataforseo.com")) {
    return new Response("{}", { status: 404 });
  }
  const [task] = JSON.parse(String(init?.body)) as { keywords: string[] }[];
  dataForSeoCalls.push(task.keywords);
  return Response.json({
    status_code: 20000,
    cost: 0.09,
    tasks: [
      {
        id: `task-${dataForSeoCalls.length}`,
        status_code: 20000,
        cost: 0.09,
        result: task.keywords.map((keyword) => ({ keyword: keyword.toLowerCase(), spell: null, search_volume: 70 })),
      },
    ],
  });
});

/** Sezione DATAFORSEO con un seed e `count - 1` suggerimenti distinti: `count` candidate in tutto. */
async function createDataForSeoSection(ownerId: string, seed: string, count: number) {
  autocomplete.suggestionsBySeed.set(
    seed,
    Array.from({ length: count - 1 }, (_, index) => `${seed} variante ${index}`)
  );
  const project = await prisma.project.create({
    data: {
      name: `Budget ${seed}`,
      owner_user_id: ownerId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "DATAFORSEO",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: seed } });
  return { project, section };
}

async function runExtraction(projectId: string, sectionId: string) {
  const { job } = await enqueueExtractionJob(projectId, sectionId);
  await runJobById(job.id);
  return prisma.job.findUniqueOrThrow({ where: { id: job.id } });
}

function monthStartUtc(offsetMonths = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1, 12));
}

async function insertSpend(costs: number[], createdAt: Date) {
  await prisma.metricsProviderRequest.createMany({
    data: costs.map((cost) => ({
      provider: "DATAFORSEO" as const,
      keyword_count: 1000,
      cost_usd: cost,
      estimated_cost_usd: cost,
      status: "completed" as const,
      created_at: createdAt,
    })),
  });
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_COST_PER_REQUEST_USD", "0.09");
  autocomplete.suggestionsBySeed.clear();
  dataForSeoCalls.length = 0;
  fetchMock.mockClear();
});

describe("tetti di spesa del fornitore di metriche", () => {
  // covers: AC-903-1
  it("con il tetto mensile quasi esaurito non chiama il fornitore e il job termina completed", async () => {
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "1.00");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "50");
    await insertSpend([0.5, 0.45], monthStartUtc());
    const { user } = await createUserWithSession();
    const { project, section } = await createDataForSeoSection(user.id, "moka", 30);

    const job = await runExtraction(project.id, section.id);

    expect(dataForSeoCalls).toHaveLength(0);
    const candidates = await prisma.keywordCandidate.findMany({ where: { subproject_id: section.id } });
    expect(candidates).toHaveLength(30);
    expect(candidates.every((candidate) => candidate.metrics_status === "missing")).toBe(true);
    expect((job.result as { metricsNotice?: string }).metricsNotice).toBe("METRICS_BUDGET_EXCEEDED");
    expect(job.status).toBe("completed");
  });

  // covers: AC-903-2
  it("con il tetto per estrazione si ferma dopo 2 richieste e registra il costo di ciascuna", async () => {
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "100");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "0.18");
    const { user } = await createUserWithSession();
    const { project, section } = await createDataForSeoSection(user.id, "caffettiera", 2500);

    const job = await runExtraction(project.id, section.id);

    expect(dataForSeoCalls.map((keywords) => keywords.length)).toEqual([1000, 1000]);
    const candidates = await prisma.keywordCandidate.findMany({ where: { subproject_id: section.id } });
    expect(candidates).toHaveLength(2500);
    const sent = new Set(dataForSeoCalls.flat());
    const unsent = candidates.filter((candidate) => !sent.has(candidate.keyword));
    expect(unsent).toHaveLength(500);
    expect(unsent.every((candidate) => candidate.metrics_status === "missing")).toBe(true);
    expect(candidates.filter((candidate) => candidate.metrics_status === "fetched")).toHaveLength(2000);
    expect((job.result as { metricsNotice?: string }).metricsNotice).toBe("RUN_BUDGET_EXCEEDED");
    const rows = await prisma.metricsProviderRequest.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => Number(row.cost_usd))).toEqual([0.09, 0.09]);
  });

  // covers: AC-903-3
  it("due estrazioni in parallelo con budget per una sola richiesta ne inviano esattamente una", async () => {
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "0.09");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "1");
    const { user } = await createUserWithSession();
    const first = await createDataForSeoSection(user.id, "moka", 20);
    const second = await createDataForSeoSection(user.id, "espresso", 20);

    const jobs = await Promise.all([
      runExtraction(first.project.id, first.section.id),
      runExtraction(second.project.id, second.section.id),
    ]);

    expect(dataForSeoCalls).toHaveLength(1);
    expect(jobs.map((job) => job.status)).toEqual(["completed", "completed"]);
    expect(await prisma.metricsProviderRequest.count()).toBe(1);
  });
});

describe("GET /api/admin/metrics-spend", () => {
  // covers: AC-903-4
  it("restituisce la spesa del mese al root admin e 403 a ADMIN non root e SUBSCRIBER", async () => {
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "25.5");
    await insertSpend([0.09, 0.09, 0.09], monthStartUtc());
    await insertSpend([0.09], monthStartUtc(-1));
    const root = await createUserWithSession({ role: UserRole.ADMIN, isRootAdmin: true });
    const admin = await createUserWithSession({ role: UserRole.ADMIN });
    const subscriber = await createUserWithSession();

    const rootResponse = await callRoute(getMetricsSpend, { url: "/api/admin/metrics-spend", cookie: root.cookie });
    const adminResponse = await callRoute(getMetricsSpend, { url: "/api/admin/metrics-spend", cookie: admin.cookie });
    const subscriberResponse = await callRoute(getMetricsSpend, {
      url: "/api/admin/metrics-spend",
      cookie: subscriber.cookie,
    });

    expect(rootResponse.status).toBe(200);
    const body = (await rootResponse.json()) as { data: Record<string, unknown> };
    expect(body.data.spentUsd).toBe(0.27);
    expect(body.data.budgetUsd).toBe(25.5);
    expect(body.data.requests).toBe(3);
    expect(body.data.keywords).toBe(3000);
    expect(adminResponse.status).toBe(403);
    expect(subscriberResponse.status).toBe(403);
  });
});
