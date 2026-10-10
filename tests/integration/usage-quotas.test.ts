// Gate di T-1703 (AC-1703-1…7): quote d'uso per workspace con il lancio commerciale attivo (avvii al giorno, keyword
// del mese, keyword arricchite dal fornitore con licenza), rimborso della quota per errori nostri entro un tetto e un solo
// job attivo per workspace (D-27 emendata). Pipeline e fornitore simulati, nessuna chiamata reale.
// Gate di T-2002 (AC-2002-1, AC-2002-2): annullamento entro 60 secondi dall'avvio senza consumo della quota.
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getUsage } from "@/app/api/billing/usage/route";
import { POST as cancelJob } from "@/app/api/jobs/[id]/cancel/route";
import { POST as runSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import type { UsageMetric } from "@/lib/generated/prisma/enums";
import { runJobById } from "@/lib/modules/jobs/job-runner";
import { AutocompleteQueryFailedError } from "@/lib/modules/providers/autocomplete/types";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { configureTestBilling } from "../helpers/paddle";

// Suggerimenti di autocomplete controllati dal test: count - 1 varianti per seed (count candidate con la seed), oppure
// ogni query fallita (autocomplete non disponibile).
const autocomplete = vi.hoisted(() => ({ count: 3, failing: false }));

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) => {
      if (autocomplete.failing) {
        throw new AutocompleteQueryFailedError(query, 503);
      }
      return Array.from({ length: autocomplete.count - 1 }, (_, index) => ({
        keyword: `${query} variante ${index + 1}`,
        source: "mock-autocomplete",
        sourceQuery: query,
      }));
    },
  }),
}));
vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

// Fornitore con licenza: ogni richiesta registra le keyword ricevute e risponde con un volume per ciascuna.
const dataForSeoKeywords: string[][] = [];
const network = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  if (!String(input).includes("api.dataforseo.com")) {
    return new Response("{}", { status: 500 });
  }
  const [task] = JSON.parse(String(init?.body)) as { keywords: string[] }[];
  dataForSeoKeywords.push(task.keywords);
  const result = task.keywords.map((keyword) => ({ keyword, spell: null, search_volume: 40 }));
  return Response.json({ status_code: 20000, cost: 0.09, tasks: [{ id: "task-1703", status_code: 20000, cost: 0.09, result }] });
});

const T0 = new Date("2026-10-08T10:00:00.000Z");

type ErrorBody = { code?: string; metric?: string; limit?: number; resetAt?: string; jobId?: string };

async function memberWithSections(names: string[], data: Record<string, unknown> = {}) {
  const member = await createUserWithSession({ displayName: `t1703-${names.length}-${randomBytes(3).toString("hex")}` });
  const project = await prisma.project.create({
    data: {
      name: "Quote",
      workspace_id: member.workspaceId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
      ...data,
    },
  });
  const sections = [];
  for (const [position, name] of names.entries()) {
    sections.push(
      await prisma.subproject.create({
        data: { project_id: project.id, name, position, seeds: { create: [{ project_id: project.id, keyword: `seed ${name}` }] } },
      })
    );
  }
  return { ...member, project, sections };
}

function start(projectId: string, sectionId: string, cookie: string) {
  return callRoute(runSection, {
    method: "POST",
    url: `/api/projects/${projectId}/subprojects/${sectionId}/run`,
    cookie,
    params: { id: projectId, subprojectId: sectionId },
  });
}

async function startAndRun(projectId: string, sectionId: string, cookie: string) {
  const response = await start(projectId, sectionId, cookie);
  expect(response.status).toBe(202);
  const { data } = (await response.json()) as { data: { jobId: string } };
  await runJobById(data.jobId);
  return prisma.job.findUniqueOrThrow({ where: { id: data.jobId } });
}

function counter(workspaceId: string, metric: UsageMetric, periodStart: Date) {
  return prisma.usageCounter.findUnique({
    where: { workspace_id_metric_period_start: { workspace_id: workspaceId, metric, period_start: periodStart } },
  });
}

function setCounter(workspaceId: string, metric: UsageMetric, periodStart: Date, count: number) {
  return prisma.usageCounter.create({ data: { workspace_id: workspaceId, metric, period_start: periodStart, count } });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubGlobal("fetch", network);
  network.mockClear();
  dataForSeoKeywords.length = 0;
  autocomplete.count = 3;
  autocomplete.failing = false;
  await resetDatabase();
  await setCommercialLaunchForTests("live");
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.useRealTimers();
  setPlansForTesting(null);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

describe("avvii al giorno", () => {
  // covers: AC-1703-1
  it("con runsPerDay = 2 già usati il terzo avvio è un 429 runs_day con l'azzeramento alla mezzanotte UTC", async () => {
    configureTestBilling({ runsPerDay: 2 });
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Generale"]);
    await startAndRun(project.id, sections[0].id, cookie);
    await startAndRun(project.id, sections[0].id, cookie);

    const third = await start(project.id, sections[0].id, cookie);

    expect(third.status).toBe(429);
    expect((await third.json()) as ErrorBody).toMatchObject({
      code: "QUOTA_EXCEEDED",
      metric: "runs_day",
      limit: 2,
      resetAt: "2026-10-09T00:00:00.000Z",
    });
    expect(await prisma.job.count({ where: { project: { workspace_id: workspaceId } } })).toBe(2);
  });

  // covers: AC-1703-2
  it("il giorno successivo l'avvio è un 202 e il contatore del nuovo giorno vale 1", async () => {
    configureTestBilling({ runsPerDay: 2 });
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Generale"]);
    await startAndRun(project.id, sections[0].id, cookie);
    await startAndRun(project.id, sections[0].id, cookie);
    expect((await start(project.id, sections[0].id, cookie)).status).toBe(429);

    vi.setSystemTime(new Date("2026-10-09T08:00:00.000Z"));
    const nextDay = await start(project.id, sections[0].id, cookie);

    expect(nextDay.status).toBe(202);
    expect((await counter(workspaceId, "runs_day", new Date("2026-10-09T00:00:00.000Z")))?.count).toBe(1);
  });
});

describe("keyword del mese", () => {
  // covers: AC-1703-3
  it("lo store salva solo il residuo del mese, segna il troncamento e il nuovo avvio è un 429 keywords_month", async () => {
    configureTestBilling({ keywordsPerMonth: 100 });
    autocomplete.count = 30;
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Generale"]);
    const month = new Date("2026-10-01T00:00:00.000Z");
    await setCounter(workspaceId, "keywords_month", month, 90);

    const job = await startAndRun(project.id, sections[0].id, cookie);
    const next = await start(project.id, sections[0].id, cookie);

    expect(job.status).toBe("completed");
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: sections[0].id } })).toBe(10);
    expect(job.result).toMatchObject({ storedCandidates: 10, truncated: true, truncatedReason: "monthly_quota" });
    expect((await counter(workspaceId, "keywords_month", month))?.count).toBe(100);
    expect(next.status).toBe(429);
    expect((await next.json()) as ErrorBody).toMatchObject({
      code: "QUOTA_EXCEEDED",
      metric: "keywords_month",
      resetAt: "2026-11-01T00:00:00.000Z",
    });
  });
});

describe("avvii concorrenti e lettura dell'uso", () => {
  // covers: AC-1703-4
  it("con un avvio residuo due avvii concorrenti danno un 202 e un 429; l'uso è leggibile solo dai membri", async () => {
    configureTestBilling({ runsPerDay: 2 });
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Prima", "Seconda"]);
    await setCounter(workspaceId, "runs_day", new Date("2026-10-08T00:00:00.000Z"), 1);
    const outsider = await createUserWithSession({ displayName: "t1703-outsider" });

    const statuses = (await Promise.all(sections.map((section) => start(project.id, section.id, cookie)))).map(
      (response) => response.status
    );
    const read = (requestCookie: string) =>
      callRoute(getUsage, { url: `/api/billing/usage?workspaceId=${workspaceId}`, cookie: requestCookie });
    const usage = await read(cookie);
    const forbidden = await read(outsider.cookie);

    expect(statuses.sort()).toEqual([202, 429]);
    const { data } = (await usage.json()) as { data: { runsToday: number; runsPerDay: number } };
    expect(usage.status).toBe(200);
    expect(data.runsToday).toBe(data.runsPerDay);
    expect(data.runsPerDay).toBe(2);
    expect(forbidden.status).toBe(404);
  });
});

describe("metriche con licenza", () => {
  // covers: AC-1703-5
  it("oltre la quota mensile del fornitore le keyword in più restano senza volumi e il job si completa", async () => {
    configureTestBilling({ licensedMetrics: true, licensedMetricsKeywordsPerMonth: 1500, maxKeywordsPerRun: 1000 });
    vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
    vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
    vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "100");
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
    autocomplete.count = 800;
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Generale"], { metrics_provider: "DATAFORSEO" });
    const month = new Date("2026-10-01T00:00:00.000Z");
    await setCounter(workspaceId, "licensed_keywords_month", month, 1000);

    const job = await startAndRun(project.id, sections[0].id, cookie);

    expect(dataForSeoKeywords.flat()).toHaveLength(500);
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: sections[0].id, metrics_status: "missing" } })).toBe(300);
    expect((await counter(workspaceId, "licensed_keywords_month", month))?.count).toBe(1500);
    expect(job.status).toBe("completed");
    expect((job.result as { metricsNotice?: string }).metricsNotice).toBe("LICENSED_METRICS_QUOTA_EXCEEDED");
  });
});

describe("rimborsi e job attivi (D-27 emendata)", () => {
  // covers: AC-1703-6
  it("un errore nostro restituisce la quota entro il tetto; oltre il tetto va all'admin; un errore dell'utente no", async () => {
    configureTestBilling({ runsPerDay: 2 }, { runRefundsPerMonth: 1 });
    autocomplete.failing = true;
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Generale"]);

    const first = await startAndRun(project.id, sections[0].id, cookie);
    const second = await startAndRun(project.id, sections[0].id, cookie);
    await prisma.seed.deleteMany({ where: { subproject_id: sections[0].id } });
    const third = await startAndRun(project.id, sections[0].id, cookie);
    const fourth = await start(project.id, sections[0].id, cookie);

    expect([first.status, first.failure_cause, first.quota_refunded]).toEqual(["failed", "INTERNAL", true]);
    expect([second.status, second.failure_cause, second.quota_refunded]).toEqual(["failed", "INTERNAL", false]);
    const alerts = await prisma.adminAuditLog.findMany({ where: { action: "quota.refund_cap_reached" } });
    expect(alerts.map((row) => [row.target_id, row.actor_user_id])).toEqual([[workspaceId, null]]);
    expect([third.status, third.failure_cause, third.quota_refunded]).toEqual(["failed", "USER", false]);
    expect(fourth.status).toBe(429);
    expect((await fourth.json()) as ErrorBody).toMatchObject({ code: "QUOTA_EXCEEDED", metric: "runs_day" });
  });

  // covers: AC-1703-7
  it("con un job pending nel workspace un avvio su un'altra sezione è un 409 senza consumare quota; in pausa è un 202", async () => {
    configureTestBilling();
    const { cookie, workspaceId, project, sections } = await memberWithSections(["Prima", "Seconda"]);
    const pending = await start(project.id, sections[0].id, cookie);
    const { data } = (await pending.json()) as { data: { jobId: string } };
    const today = new Date("2026-10-08T00:00:00.000Z");

    const blocked = await start(project.id, sections[1].id, cookie);
    const runsAfterBlocked = (await counter(workspaceId, "runs_day", today))?.count;
    await setCommercialLaunchForTests("paused");
    const paused = await start(project.id, sections[1].id, cookie);

    expect(blocked.status).toBe(409);
    expect((await blocked.json()) as ErrorBody).toMatchObject({ code: "JOB_ALREADY_ACTIVE", jobId: data.jobId });
    expect(runsAfterBlocked).toBe(1);
    expect(paused.status).toBe(202);
  });
});

describe("annullamento entro 60 secondi (T-2002, D-27 emendata)", () => {
  const today = new Date("2026-10-08T00:00:00.000Z");
  const month = new Date("2026-10-01T00:00:00.000Z");

  /** Avvio con 1 avvio già usato su 3 al giorno: restituisce il job pending appena creato. */
  async function startWithOneRunUsed() {
    configureTestBilling({ runsPerDay: 3 });
    const member = await memberWithSections(["Generale"]);
    await setCounter(member.workspaceId, "runs_day", today, 1);
    const response = await start(member.project.id, member.sections[0].id, member.cookie);
    expect(response.status).toBe(202);
    const { data } = (await response.json()) as { data: { jobId: string } };
    const job = await prisma.job.findUniqueOrThrow({ where: { id: data.jobId } });
    expect((await counter(member.workspaceId, "runs_day", today))?.count).toBe(2);
    return { ...member, job };
  }

  function cancel(jobId: string, cookie: string) {
    return callRoute(cancelJob, { method: "POST", url: `/api/jobs/${jobId}/cancel`, cookie, params: { id: jobId } });
  }

  const after = (job: { created_at: Date }, seconds: number) => new Date(job.created_at.getTime() + seconds * 1000);

  // covers: AC-2002-1
  it("un job pending annullato dopo 10 secondi restituisce l'avvio; i rimborsi del mese non cambiano", async () => {
    const { cookie, workspaceId, job } = await startWithOneRunUsed();
    vi.setSystemTime(after(job, 10));

    const response = await cancel(job.id, cookie);

    expect(response.status).toBe(200);
    expect((await counter(workspaceId, "runs_day", today))?.count).toBe(1);
    expect(await counter(workspaceId, "run_refunds_month", month)).toBeNull();
    const canceled = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect([canceled.status, canceled.quota_refunded]).toEqual(["canceled", true]);
  });

  // covers: AC-2002-1
  it("un job running annullato dopo 10 secondi restituisce l'avvio quando si ferma, anche se si ferma più tardi", async () => {
    const { cookie, workspaceId, job } = await startWithOneRunUsed();
    await prisma.job.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "running" } });
    vi.setSystemTime(after(job, 10));

    const response = await cancel(job.id, cookie);
    const runsWhileRunning = (await counter(workspaceId, "runs_day", today))?.count;
    vi.setSystemTime(after(job, 90));
    const stopped = await runJobById(job.id);

    expect(response.status).toBe(202);
    expect(runsWhileRunning).toBe(2);
    expect([stopped?.status, stopped?.quota_refunded]).toEqual(["canceled", true]);
    expect((await counter(workspaceId, "runs_day", today))?.count).toBe(1);
    expect(await counter(workspaceId, "run_refunds_month", month)).toBeNull();
  });

  // covers: AC-2002-2
  it("un job annullato dopo 61 secondi consuma l'avvio", async () => {
    const { cookie, workspaceId, job } = await startWithOneRunUsed();
    vi.setSystemTime(after(job, 61));

    const response = await cancel(job.id, cookie);

    expect(response.status).toBe(200);
    expect((await counter(workspaceId, "runs_day", today))?.count).toBe(2);
    const canceled = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect([canceled.status, canceled.quota_refunded]).toEqual(["canceled", false]);
  });
});
