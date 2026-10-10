// Gate di T-1605 (AC-1605-1…5): diritti del piano applicati lato server, 402 PLAN_LIMIT, nessun limite superato da
// richieste concorrenti, metriche con licenza solo con il diritto del piano.
// Gate di T-2003 (AC-2003-1): il root admin usa sempre DATAFORSEO; gate di T-2004 (AC-2004-1): il progetto
// dell'onboarding non conta nel limite dei progetti.
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exportSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { POST as runSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { PATCH as patchSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/route";
import { POST as createProject } from "@/app/api/projects/route";
import { POST as createOnboardingProject } from "@/app/api/onboarding/project/route";
import { POST as createInvite } from "@/app/api/workspaces/[workspaceId]/invites/route";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import { runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { billingTeam } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestBilling } from "../helpers/paddle";

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      [1, 2, 3].map((n) => ({ keyword: `${query} variante ${n}`, source: "mock-autocomplete", sourceQuery: query })),
  }),
}));

// Ogni richiesta di rete (Google, DataForSEO) passa da qui: i test contano che non ne parta nessuna.
const network = vi.fn(async () => new Response("{}", { status: 500 }));

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubGlobal("fetch", network);
  network.mockClear();
  await resetDatabase();
  await setCommercialLaunchForTests("live");
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

type ErrorBody = { code: string; limit?: string; max?: number };

async function projectIn(workspaceId: string, name: string, data: Record<string, unknown> = {}) {
  return prisma.project.create({
    data: {
      name,
      workspace_id: workspaceId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
      ...data,
    },
  });
}

async function sectionWithSeeds(projectId: string, name: string, seeds: string[], data: Record<string, unknown> = {}) {
  const section = await prisma.subproject.create({ data: { project_id: projectId, name, position: 0, ...data } });
  await prisma.seed.createMany({ data: seeds.map((keyword) => ({ project_id: projectId, subproject_id: section.id, keyword })) });
  return section;
}

describe("limiti di conteggio", () => {
  // covers: AC-1605-1
  it("al limite dei progetti la creazione è un 402 anche con piano e limiti finti nel body", async () => {
    configureTestBilling({ maxProjects: 2 });
    const { member, workspaceId } = await billingTeam("t1605");
    await projectIn(workspaceId, "Uno");
    await projectIn(workspaceId, "Due");

    const response = await callRoute(createProject, {
      method: "POST",
      url: "/api/projects",
      body: { name: "Tre", workspaceId, plan: "pro", limits: { maxProjects: 999 } },
      cookie: member.cookie,
    });

    expect(response.status).toBe(402);
    expect((await response.json()) as ErrorBody).toMatchObject({ code: "PLAN_LIMIT", limit: "maxProjects", max: 2 });
    expect(await prisma.project.count({ where: { workspace_id: workspaceId } })).toBe(2);
  });

  // covers: AC-1605-2
  it("due creazioni concorrenti con un posto libero: una 201 e una 402", async () => {
    configureTestBilling({ maxProjects: 2 });
    const { member, workspaceId } = await billingTeam("t1605");
    await projectIn(workspaceId, "Uno");
    const create = (name: string) =>
      callRoute(createProject, { method: "POST", url: "/api/projects", body: { name, workspaceId }, cookie: member.cookie });

    const statuses = (await Promise.all([create("A"), create("B")])).map((response) => response.status).sort();

    expect(statuses).toEqual([201, 402]);
    expect(await prisma.project.count({ where: { workspace_id: workspaceId } })).toBe(2);
  });

  // covers: AC-1605-4
  it("oltre il limite di seed la PATCH della sezione è un 402 e le seed restano quelle di prima", async () => {
    configureTestBilling({ maxSeedsPerSection: 3 });
    const { member, workspaceId } = await billingTeam("t1605");
    const project = await projectIn(workspaceId, "Seed");
    const section = await sectionWithSeeds(project.id, "Generale", ["uno", "due"]);

    const response = await callRoute(patchSection, {
      method: "PATCH",
      url: `/api/projects/${project.id}/subprojects/${section.id}`,
      body: { seeds: ["a", "b", "c", "d"] },
      cookie: member.cookie,
      params: { id: project.id, subprojectId: section.id },
    });

    expect(response.status).toBe(402);
    expect((await response.json()) as ErrorBody).toMatchObject({ code: "PLAN_LIMIT", limit: "maxSeedsPerSection", max: 3 });
    const seeds = await prisma.seed.findMany({ where: { subproject_id: section.id }, orderBy: { keyword: "asc" } });
    expect(seeds.map((seed) => seed.keyword)).toEqual(["due", "uno"]);
  });

  it("dopo un downgrade la sezione oltre il limite resta modificabile finché le seed non aumentano", async () => {
    configureTestBilling({ maxSeedsPerSection: 3 });
    const { member, workspaceId } = await billingTeam("t1605");
    const project = await projectIn(workspaceId, "Downgrade");
    const section = await sectionWithSeeds(project.id, "Generale", ["a", "b", "c", "d", "e"]);
    const patch = (body: Record<string, unknown>) =>
      callRoute(patchSection, {
        method: "PATCH",
        url: `/api/projects/${project.id}/subprojects/${section.id}`,
        body,
        cookie: member.cookie,
        params: { id: project.id, subprojectId: section.id },
      });

    const sameSeeds = await patch({ name: "Rinominata", seeds: ["a", "b", "c", "d", "e"] });
    const moreSeeds = await patch({ seeds: ["a", "b", "c", "d", "e", "f"] });

    expect(sameSeeds.status).toBe(200);
    expect([moreSeeds.status, ((await moreSeeds.json()) as ErrorBody).limit]).toEqual([402, "maxSeedsPerSection"]);
    expect(await prisma.seed.count({ where: { subproject_id: section.id } })).toBe(5);
  });

  it("oltre i posti del piano un nuovo invito è un 402 senza invito né email", async () => {
    configureTestBilling({ seats: 3 });
    const { owner, workspaceId } = await billingTeam("t1605");

    const response = await callRoute(createInvite, {
      method: "POST",
      url: `/api/workspaces/${workspaceId}/invites`,
      body: { email: "nuovo@example.test", role: "MEMBER" },
      cookie: owner.cookie,
      params: { workspaceId },
    });

    expect((await response.json()) as ErrorBody).toMatchObject({ code: "PLAN_LIMIT", limit: "seats", max: 3 });
    expect(await prisma.workspaceInvite.count()).toBe(0);
    expect(await prisma.emailOutbox.count()).toBe(0);
  });
});

describe("funzioni del piano", () => {
  // covers: AC-1605-3
  it("senza export su Google Sheets nel piano la rotta è un 402 e Google non riceve richieste", async () => {
    configureTestBilling({ sheetsExport: false });
    const { member, workspaceId } = await billingTeam("t1605");
    const project = await projectIn(workspaceId, "Export");

    const response = await callRoute(exportSheets, {
      method: "POST",
      url: `/api/projects/${project.id}/export/google-sheets`,
      body: { fileName: "Keyword", scope: "non-excluded" },
      cookie: member.cookie,
      params: { id: project.id },
    });

    expect(response.status).toBe(402);
    expect(((await response.json()) as ErrorBody).limit).toBe("sheetsExport");
    expect(network).not.toHaveBeenCalled();
  });

  // covers: AC-1605-5
  it("senza metriche con licenza DATAFORSEO è un 402 e l'estrazione già impostata usa NONE senza chiamate", async () => {
    configureTestBilling({ licensedMetrics: false });
    vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
    vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "100");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
    const { member, workspaceId } = await billingTeam("t1605");
    const project = await projectIn(workspaceId, "Metriche");
    const licensed = await sectionWithSeeds(project.id, "Con licenza", ["scarpe"], { metrics_provider_override: "DATAFORSEO" });
    const second = await prisma.subproject.create({ data: { project_id: project.id, name: "Seconda", position: 1 } });

    const patch = await callRoute(patchSection, {
      method: "PATCH",
      url: `/api/projects/${project.id}/subprojects/${second.id}`,
      body: { metrics_provider_override: "DATAFORSEO" },
      cookie: member.cookie,
      params: { id: project.id, subprojectId: second.id },
    });
    const run = await callRoute(runSection, {
      method: "POST",
      url: `/api/projects/${project.id}/subprojects/${licensed.id}/run`,
      cookie: member.cookie,
      params: { id: project.id, subprojectId: licensed.id },
    });
    const { data } = (await run.json()) as { data: { jobId: string } };
    const job = await runJobById(data.jobId);

    expect([patch.status, ((await patch.json()) as ErrorBody).limit]).toEqual([402, "licensedMetrics"]);
    expect(job?.status).toBe("completed");
    expect((job?.result as { metricsNotice?: string }).metricsNotice).toBe("PLAN_NO_LICENSED_METRICS");
    expect(network).not.toHaveBeenCalled();
  });

  it("il tetto di keyword del piano salva solo le prime keyword e segna il risultato come troncato", async () => {
    configureTestBilling({ maxKeywordsPerRun: 2 });
    const { member, workspaceId } = await billingTeam("t1605");
    const project = await projectIn(workspaceId, "Tetto");
    const section = await sectionWithSeeds(project.id, "Generale", ["borse"]);

    const run = await callRoute(runSection, {
      method: "POST",
      url: `/api/projects/${project.id}/subprojects/${section.id}/run`,
      cookie: member.cookie,
      params: { id: project.id, subprojectId: section.id },
    });
    const job = await runJobById(((await run.json()) as { data: { jobId: string } }).data.jobId);

    expect(job?.status).toBe("completed");
    expect(job?.result).toMatchObject({ storedCandidates: 2, truncated: true });
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: section.id } })).toBe(2);
  });

  it("con il lancio in pausa nessun limite si applica", async () => {
    configureTestBilling({ maxProjects: 0, sheetsExport: false });
    await setCommercialLaunchForTests("paused");
    const { member, workspaceId } = await billingTeam("t1605");

    const response = await callRoute(createProject, {
      method: "POST",
      url: "/api/projects",
      body: { name: "In pausa", workspaceId },
      cookie: member.cookie,
    });

    expect(response.status).toBe(201);
  });
});

describe("rifiniture del macrotask 20 (D-36)", () => {
  // covers: AC-2003-1
  it("con il lancio attivo il root admin su un piano free usa DATAFORSEO; il MEMBER di un workspace free riceve 402 PLAN_LIMIT", async () => {
    configureTestBilling({ licensedMetrics: false, licensedMetricsKeywordsPerMonth: 0 });
    vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
    vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "100");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
    const enriched: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).includes("api.dataforseo.com")) {
        return new Response("{}", { status: 500 });
      }
      const [task] = JSON.parse(String(init?.body)) as { keywords: string[] }[];
      enriched.push(...task.keywords);
      const result = task.keywords.map((keyword) => ({ keyword, spell: null, search_volume: 70 }));
      return Response.json({ status_code: 20000, cost: 0.09, tasks: [{ id: "task-2003", status_code: 20000, cost: 0.09, result }] });
    });
    const root = await createUserWithSession({ displayName: "t2003-root", role: "ADMIN", isRootAdmin: true });
    const { member, workspaceId } = await billingTeam("t2003");
    const rootProject = await projectIn(root.workspaceId, "Root");
    const rootSection = await sectionWithSeeds(rootProject.id, "Generale", ["zaini"]);
    const memberProject = await projectIn(workspaceId, "Membro");
    const memberSection = await sectionWithSeeds(memberProject.id, "Generale", ["zaini"]);
    const chooseDataForSeo = (cookie: string, projectId: string, sectionId: string) =>
      callRoute(patchSection, {
        method: "PATCH",
        url: `/api/projects/${projectId}/subprojects/${sectionId}`,
        body: { metrics_provider_override: "DATAFORSEO" },
        cookie,
        params: { id: projectId, subprojectId: sectionId },
      });

    const rootChoice = await chooseDataForSeo(root.cookie, rootProject.id, rootSection.id);
    const rootRun = await callRoute(runSection, {
      method: "POST",
      url: `/api/projects/${rootProject.id}/subprojects/${rootSection.id}/run`,
      cookie: root.cookie,
      params: { id: rootProject.id, subprojectId: rootSection.id },
    });
    const rootJob = await runJobById(((await rootRun.json()) as { data: { jobId: string } }).data.jobId);
    const memberChoice = await chooseDataForSeo(member.cookie, memberProject.id, memberSection.id);

    expect(rootChoice.status).toBe(200);
    expect(rootJob?.status).toBe("completed");
    expect((rootJob?.result as { metricsNotice?: string }).metricsNotice).toBeUndefined();
    expect(enriched).toHaveLength(4);
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: rootSection.id, metrics_provider: "DATAFORSEO" } })).toBe(4);
    expect(memberChoice.status).toBe(402);
    expect((await memberChoice.json()) as ErrorBody).toMatchObject({ code: "PLAN_LIMIT", limit: "licensedMetrics" });
  });

  // covers: AC-2004-1
  it("con maxProjects 1 e il progetto dell'onboarding il primo POST /api/projects è 201 e il secondo 402 PLAN_LIMIT", async () => {
    configureTestBilling({ maxProjects: 1 });
    const user = await createUserWithSession({ displayName: "t2004-user" });
    const onboarding = await callRoute(createOnboardingProject, {
      method: "POST",
      url: "/api/onboarding/project",
      body: { name: "Guidato", idempotencyKey: randomUUID() },
      cookie: user.cookie,
    });
    const create = (name: string) => callRoute(createProject, { method: "POST", url: "/api/projects", body: { name }, cookie: user.cookie });

    const first = await create("Primo");
    const second = await create("Secondo");

    expect(onboarding.status).toBe(201);
    expect(first.status).toBe(201);
    expect(second.status).toBe(402);
    expect((await second.json()) as ErrorBody).toMatchObject({ code: "PLAN_LIMIT", limit: "maxProjects", max: 1 });
    expect(await prisma.project.count({ where: { workspace_id: user.workspaceId } })).toBe(2);
  });
});
