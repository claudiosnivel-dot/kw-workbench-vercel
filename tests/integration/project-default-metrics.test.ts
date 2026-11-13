// Gate di T-6103 (AC-6103-1…AC-6103-3, D-57): i progetti nuovi di chi ha i dati con licenza nascono con DataForSEO come
// fornitore dei volumi, quindi la ricerca finisce con i volumi; per gli altri resta NONE e una scelta esplicita vale
// sempre (D-30). Autocomplete e DataForSEO simulati, nessuna chiamata reale.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createProject } from "@/app/api/projects/route";
import { POST as quickStart } from "@/app/api/projects/quick-start/route";
import { WORKSPACE_COOKIE_NAME } from "@/lib/authz/workspace";
import { UserRole } from "@/lib/generated/prisma/client";
import { resetEnvForTests } from "@/lib/env";
import { runJobById } from "@/lib/modules/jobs/job-runner";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { billingTeam } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

const TOPIC = "noleggio magnetoterapia";
const SUGGESTIONS = [`${TOPIC} costo`, `${TOPIC} milano`, `${TOPIC} a casa`];

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      (query === "noleggio magnetoterapia"
        ? ["noleggio magnetoterapia costo", "noleggio magnetoterapia milano", "noleggio magnetoterapia a casa"]
        : []
      ).map((keyword) => ({ keyword, source: "mock-autocomplete", sourceQuery: query })),
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
        result: task.keywords.map((keyword, index) => ({ keyword, spell: null, search_volume: 100 + index })),
      },
    ],
  });
});

type QuickStartBody = { data: { projectId: string; topicId: string; jobId: string | null; extraction: string } };

function postQuickStart(cookie: string) {
  return callRoute(quickStart, { method: "POST", url: "/api/projects/quick-start", body: { topic: TOPIC }, cookie });
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await resetDatabase();
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_COST_PER_REQUEST_USD", "0.09");
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
  resetEnvForTests();
  resetDataForSeoLimiterForTests();
  dataForSeoCalls.length = 0;
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("fornitore dei volumi dei progetti nuovi", () => {
  // covers: AC-6103-1
  it("per il root admin l'avvio rapido crea il progetto con DataForSEO e la ricerca finisce con i volumi", async () => {
    const { cookie } = await createUserWithSession({ role: UserRole.ADMIN, isRootAdmin: true });

    const response = await postQuickStart(cookie);
    const { data } = (await response.json()) as QuickStartBody;
    await runJobById(data.jobId as string);

    expect(response.status).toBe(201);
    expect(data.extraction).toBe("started");
    const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId } });
    expect(project.metrics_provider).toBe("DATAFORSEO");
    const job = await prisma.job.findUniqueOrThrow({ where: { id: data.jobId as string } });
    expect(job.status).toBe("completed");
    const keywords = await prisma.keywordCandidate.findMany({ where: { project_id: project.id } });
    expect(keywords.map((row) => row.keyword).sort()).toEqual([TOPIC, ...SUGGESTIONS].sort());
    for (const row of keywords) {
      expect(row).toMatchObject({ metrics_provider: "DATAFORSEO", metrics_status: "fetched" });
      expect(row.avg_monthly_searches).toBeGreaterThanOrEqual(100);
    }
    expect(dataForSeoCalls).toHaveLength(1);
    const requests = await prisma.metricsProviderRequest.findMany({ where: { project_id: project.id } });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: "DATAFORSEO", status: "completed", job_id: data.jobId, keyword_count: 4 });
  });

  // covers: AC-6103-2
  it("per un MEMBER con il lancio commerciale spento il progetto nasce con NONE e DataForSEO non è chiamato", async () => {
    const { member, workspaceId } = await billingTeam("dm6103");

    const response = await postQuickStart(`${member.cookie}; ${WORKSPACE_COOKIE_NAME}=${workspaceId}`);
    const { data } = (await response.json()) as QuickStartBody;
    await runJobById(data.jobId as string);

    expect(response.status).toBe(201);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: data.projectId } });
    expect(project).toMatchObject({ workspace_id: workspaceId, metrics_provider: "NONE" });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: data.jobId as string } })).status).toBe("completed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // covers: AC-6103-3
  it("una scelta esplicita resta quella: il root admin che invia NONE ha un progetto con NONE", async () => {
    const { cookie } = await createUserWithSession({ role: UserRole.ADMIN, isRootAdmin: true });

    const chosen = await callRoute(createProject, { method: "POST", url: "/api/projects", body: { name: "Scelto", metrics_provider: "NONE" }, cookie });
    const defaulted = await callRoute(createProject, { method: "POST", url: "/api/projects", body: { name: "Predefinito" }, cookie });

    expect(chosen.status).toBe(201);
    expect(defaulted.status).toBe(201);
    const projects = await prisma.project.findMany({ select: { name: true, metrics_provider: true }, orderBy: { name: "asc" } });
    expect(projects).toEqual([
      { name: "Predefinito", metrics_provider: "DATAFORSEO" },
      { name: "Scelto", metrics_provider: "NONE" },
    ]);
  });
});
