// Gate di T-5201 (AC-5201-1, AC-5201-2, AC-5201-3): la lettura dell'articolo riprende il lavoro fermo come il cron
// reap-jobs, con lo stesso updateMany condizionale che conta il tentativo; al tetto JOB_MAX_ATTEMPTS il lavoro è failed
// e l'articolo FAILED; un lavoro con un battito recente non si tocca, anche con più letture. In più due letture insieme
// che riprendono il lavoro una volta sola. La continuazione è sostituita da un registratore: nessuna chiamata HTTP.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleArticleRunContinuation } from "@/lib/modules/jobs/continuation";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { readArticle, saveArticleSettings, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleArticleRunContinuation: vi.fn(),
}));

const registrar = vi.mocked(scheduleArticleRunContinuation);
const MAX_ATTEMPTS = 5;

type ReadBody = { data: { status: string; errorCode: string | null; run: { id: string; status: string } | null } };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("JOB_MAX_ATTEMPTS", String(MAX_ATTEMPTS));
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  await resetDatabase();
});

/** Articolo GENERATING avviato da un MEMBER, con il lavoro running senza lease, il battito di ago ms fa e attempts dati. */
async function runningArticle(label: string, heartbeatAgoMs: number, attempts: number) {
  await saveArticleSettings();
  const { member, spoke } = await memberWithPlan(label);
  const response = await startArticle(member.cookie, spoke, { length: "MEDIUM" });
  expect(response.status).toBe(202);
  const { data } = (await response.json()) as { data: { articleId: string; runId: string } };
  const heartbeat = new Date(Date.now() - heartbeatAgoMs);
  await prisma.articleRun.update({ where: { id: data.runId }, data: { status: "running", attempts, locked_until: null, heartbeat_at: heartbeat } });
  registrar.mockClear();
  return { member, spoke, heartbeat, ...data };
}

const runRow = (id: string) => prisma.articleRun.findUniqueOrThrow({ where: { id } });

describe("ripresa del lavoro fermo alla lettura dell'articolo", () => {
  // covers: AC-5201-1
  it("la GET di un MEMBER riprende il lavoro fermo: un tentativo in più, battito aggiornato e una continuazione", async () => {
    const stale = await runningArticle("t5201-a", 10 * 60_000, 0);

    const response = await readArticle(stale.member.cookie, stale.spoke);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ReadBody;
    expect(body.data.run).toMatchObject({ id: stale.runId, status: "running" });
    const run = await runRow(stale.runId);
    expect(run.attempts).toBe(1);
    expect(run.heartbeat_at!.getTime()).toBeGreaterThan(stale.heartbeat.getTime());
    expect(registrar.mock.calls).toEqual([[stale.runId]]);
  });

  // covers: AC-5201-2
  it("con attempts al tetto JOB_MAX_ATTEMPTS il lavoro è failed e la risposta ha FAILED, INTERNAL_ERROR e run null", async () => {
    const exhausted = await runningArticle("t5201-b", 10 * 60_000, MAX_ATTEMPTS);

    const response = await readArticle(exhausted.member.cookie, exhausted.spoke);

    expect(response.status).toBe(200);
    expect(((await response.json()) as ReadBody).data).toMatchObject({ status: "FAILED", errorCode: "INTERNAL_ERROR", run: null });
    expect(await runRow(exhausted.runId)).toMatchObject({ status: "failed", error_code: "INTERNAL_ERROR" });
    expect(registrar).not.toHaveBeenCalled();
  });

  // covers: AC-5201-3
  it("un lavoro con il battito di 10 secondi fa non si riprende, anche con due letture", async () => {
    const healthy = await runningArticle("t5201-c", 10_000, 0);

    expect((await readArticle(healthy.member.cookie, healthy.spoke)).status).toBe(200);
    expect((await readArticle(healthy.member.cookie, healthy.spoke)).status).toBe(200);

    expect(await runRow(healthy.runId)).toMatchObject({ status: "running", attempts: 0 });
    expect(registrar).not.toHaveBeenCalled();
  });

  it("due letture insieme riprendono il lavoro fermo una volta sola", async () => {
    const stale = await runningArticle("t5201-d", 10 * 60_000, 0);

    const responses = await Promise.all([readArticle(stale.member.cookie, stale.spoke), readArticle(stale.member.cookie, stale.spoke)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await runRow(stale.runId)).toMatchObject({ status: "running", attempts: 1 });
    expect(registrar.mock.calls).toEqual([[stale.runId]]);
  });
});
