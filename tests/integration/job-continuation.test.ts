// Gate di T-1203 (AC-1203-1…AC-1203-4): rotta interna firmata, continuazione dopo ogni passo, reaper idempotente
// al cron e fallimento al tetto di tentativi. La continuazione è sostituita da un registratore e after() da una coda
// svuotata dal test.
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as reapJobsCron } from "@/app/api/cron/reap-jobs/route";
import { POST as advanceRoute } from "@/app/api/internal/jobs/[id]/advance/route";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { signJobStep } from "@/lib/modules/jobs/job-signature";
import { runJobStep } from "@/lib/modules/jobs/job-step";
import { reapStaleJobs } from "@/lib/modules/jobs/reaper";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const afterQueue = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterQueue.push(task);
  },
}));

// Registratore della continuazione: nessuna chiamata HTTP nei test.
vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleJobContinuation: vi.fn(),
}));

vi.mock("@/lib/modules/jobs/advance-job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/jobs/advance-job")>();
  return { ...actual, advanceJob: vi.fn(actual.advanceJob) };
});

// Autocomplete senza rete; con clockStepMs ogni query sposta l'orologio, così il passo supera la sua scadenza.
const autocomplete = vi.hoisted(() => ({ clockStepMs: 0 }));
vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) => {
      if (autocomplete.clockStepMs > 0) {
        vi.setSystemTime(Date.now() + autocomplete.clockStepMs);
      }
      return [{ keyword: `${query} variante`, source: "mock-autocomplete", sourceQuery: query }];
    },
  }),
}));

const registrar = vi.mocked(scheduleJobContinuation);
const CRON_SECRET = randomBytes(24).toString("hex");

async function flushAfter(): Promise<void> {
  while (afterQueue.length > 0) {
    await afterQueue.shift()?.();
  }
}

/** Sezione con 1 seed, 3 pattern e l'espansione alfabetica: 30 query previste. */
async function createPendingJob() {
  const { user } = await createUserWithSession({ displayName: "t1203-owner" });
  const project = await prisma.project.create({
    data: {
      name: "Job T-1203",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "MOCK",
      expand_alpha: true,
      expand_numeric: false,
      expand_patterns: true,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "caffe" } });
  await prisma.expansionPattern.createMany({
    data: ["{seed} moka", "{seed} espresso", "{seed} solubile"].map((pattern) => ({ project_id: project.id, pattern })),
  });
  const { job } = await enqueueExtractionJob(project.id, section.id);
  return job;
}

function callAdvance(jobId: string, headers: Record<string, string> = {}) {
  return callRoute(advanceRoute, { method: "POST", url: `/api/internal/jobs/${jobId}/advance`, params: { id: jobId }, headers });
}

function callCron(authorization?: string) {
  return callRoute(reapJobsCron, {
    url: "/api/cron/reap-jobs",
    headers: authorization === undefined ? {} : { authorization },
  });
}

function signedHeaders(jobId: string, expiresAt: number): Record<string, string> {
  return { "x-job-expires": String(expiresAt), "x-job-signature": signJobStep(jobId, expiresAt) };
}

/** Job bloccato: running, lease scaduto, heartbeat di 4 minuti prima. */
async function makeStuck(jobId: string, attempts: number) {
  const now = Date.now();
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "running",
      attempts,
      locked_until: new Date(now - 60_000),
      heartbeat_at: new Date(now - 4 * 60_000),
    },
  });
}

beforeAll(() => {
  vi.stubEnv("JOB_SIGNING_SECRET", randomBytes(24).toString("hex"));
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  afterQueue.length = 0;
  registrar.mockClear();
  vi.mocked(advanceJob).mockClear();
  autocomplete.clockStepMs = 0;
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rotta interna e cron senza credenziali valide", () => {
  // covers: AC-1203-1
  it("cinque richieste non autorizzate ricevono 401 e il job resta invariato", async () => {
    const job = await createPendingJob();
    const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });

    const responses = [
      await callAdvance(job.id),
      await callAdvance(job.id, signedHeaders(job.id, Date.now() - 1_000)),
      await callAdvance(job.id, signedHeaders("job-di-un-altro", Date.now() + 60_000)),
      await callCron(),
      await callCron(`Bearer ${CRON_SECRET}x`),
    ];
    await flushAfter();

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.updated_at).toEqual(before.updated_at);
    expect(after.phase).toBe(before.phase);
    expect(after.progress_done).toBe(before.progress_done);
    expect(vi.mocked(advanceJob)).not.toHaveBeenCalled();
  });
});

describe("rotta interna con firma valida", () => {
  // covers: AC-1203-2
  it("risponde 202, il passo avanza il job e il registratore riceve 1 continuazione", async () => {
    const job = await createPendingJob();
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    autocomplete.clockStepMs = 10_000;

    const response = await callAdvance(job.id, signedHeaders(job.id, Date.now() + 60_000));
    expect(response.status).toBe(202);
    await flushAfter();

    const advanced = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(advanced.progress_total).toBe(30);
    expect(advanced.progress_done > 0 || advanced.phase !== "expand").toBe(true);
    expect(registrar.mock.calls).toEqual([[job.id]]);
  });
});

describe("reaper dei job bloccati", () => {
  // covers: AC-1203-3
  it("due consegne del cron di seguito riprendono il job una sola volta", async () => {
    const job = await createPendingJob();
    await makeStuck(job.id, 1);

    const first = await callCron(`Bearer ${CRON_SECRET}`);
    const second = await callCron(`Bearer ${CRON_SECRET}`);

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ resumed: 1, failed: 0 });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ resumed: 0, failed: 0 });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(2);
    expect(registrar.mock.calls).toEqual([[job.id]]);
  });

  // covers: AC-1203-4
  it("con attempts uguale a JOB_MAX_ATTEMPTS il job è failed con il messaggio generico e nessuna continuazione", async () => {
    vi.stubEnv("JOB_MAX_ATTEMPTS", "5");
    const job = await createPendingJob();
    await makeStuck(job.id, 5);

    await reapStaleJobs();

    const failed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe("failed");
    expect(failed.completed_at).not.toBeNull();
    expect(failed.error_message).toBe("Estrazione interrotta dopo 5 tentativi");
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe("eccezione non gestita in un passo", () => {
  it("conta il tentativo, rilascia il lease e ripianifica; al tetto il job è failed senza continuazione", async () => {
    vi.stubEnv("JOB_MAX_ATTEMPTS", "2");
    const job = await createPendingJob();
    vi.mocked(advanceJob)
      .mockRejectedValueOnce(new Error("errore del provider"))
      .mockRejectedValueOnce(new Error("errore del provider"));

    await runJobStep(job.id);
    const retried = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(retried.attempts).toBe(1);
    expect(retried.locked_until).toBeNull();
    expect(registrar.mock.calls).toEqual([[job.id]]);

    await runJobStep(job.id);
    const failed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe("failed");
    expect(failed.error_message).toBe("Estrazione interrotta dopo 2 tentativi");
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});

describe("continuazione di produzione", () => {
  it("POST firmata verso VERCEL_URL con il bypass della protezione, mai verso l'header Host", async () => {
    vi.stubEnv("VERCEL_URL", "seogodmode-abc123.vercel.app");
    vi.stubEnv("APP_PUBLIC_URL", "https://app.example.com");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass-di-prova");
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { scheduleJobContinuation: realSchedule } =
      await vi.importActual<typeof import("@/lib/modules/jobs/continuation")>("@/lib/modules/jobs/continuation");

    realSchedule("job-123");
    expect(fetchMock).not.toHaveBeenCalled();
    await flushAfter();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://seogodmode-abc123.vercel.app/api/internal/jobs/job-123/advance");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-vercel-protection-bypass"]).toBe("bypass-di-prova");
    const response = await callAdvance("job-123", headers);
    expect(response.status).toBe(202);
    afterQueue.length = 0;
    vi.unstubAllGlobals();
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "");
    vi.stubEnv("APP_PUBLIC_URL", "");
  });
});
