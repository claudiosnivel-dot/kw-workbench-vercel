// Gate di T-4101 (AC-4101-3): la rotta interna di un lavoro di articolo accetta solo la firma HMAC di «article-run:» più
// l'id; la firma valida di un job delle ricerche con lo stesso id riceve 401 e il lavoro non cambia. In più il proxy che
// lascia passare la rotta senza sessione e la continuazione di produzione verso la rotta degli articoli.
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as advanceRoute } from "@/app/api/internal/article-runs/[id]/advance/route";
import { scheduleArticleRunContinuation } from "@/lib/modules/jobs/continuation";
import { articleRunStepId, signJobStep } from "@/lib/modules/jobs/job-signature";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { articleCompletion, saveArticleSettings, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { clearAfter, flushAfter } from "../helpers/next-after";

const fetchMock = vi.fn<typeof fetch>();

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("JOB_SIGNING_SECRET", randomBytes(24).toString("hex"));
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
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** Lavoro pending di un articolo avviato da un MEMBER, con la coda di after() svuotata dopo l'avvio. */
async function pendingRun(): Promise<string> {
  await saveArticleSettings();
  const { member, spoke } = await memberWithPlan("t4101-sig");
  const response = await startArticle(member.cookie, spoke);
  clearAfter();
  return ((await response.json()) as { data: { runId: string } }).data.runId;
}

function callAdvance(runId: string, signed: string) {
  const expiresAt = Date.now() + 60_000;
  return callRoute(advanceRoute, {
    method: "POST",
    url: `/api/internal/article-runs/${runId}/advance`,
    params: { id: runId },
    headers: { "x-job-expires": String(expiresAt), "x-job-signature": signJobStep(signed, expiresAt) },
  });
}

describe("rotta interna dei lavori degli articoli", () => {
  // covers: AC-4101-3
  it("con la firma di un job delle ricerche risponde 401 e il lavoro non cambia; con la firma giusta 202", async () => {
    const runId = await pendingRun();
    const before = await prisma.articleRun.findUniqueOrThrow({ where: { id: runId } });
    // impacted-by: T-4201 e T-4202 (il lavoro scrive anche blocchi e FAQ: risposte simulate per ogni richiesta)
    fetchMock.mockImplementation(async (_url, init) => articleCompletion(init));

    const jobSigned = await callAdvance(runId, runId);
    await flushAfter();

    expect(jobSigned.status).toBe(401);
    expect(await jobSigned.json()).toMatchObject({ code: "JOB_SIGNATURE_INVALID" });
    expect(await prisma.articleRun.findUniqueOrThrow({ where: { id: runId } })).toEqual(before);
    expect(fetchMock).not.toHaveBeenCalled();

    const signed = await callAdvance(runId, articleRunStepId(runId));
    expect(signed.status).toBe(202);
    expect(await signed.json()).toEqual({ data: { runId } });
    await flushAfter();
    expect(await prisma.articleRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "completed" });
  });

  it("firma assente o scaduta risponde 401", async () => {
    const runId = await pendingRun();
    const unsigned = await callRoute(advanceRoute, { method: "POST", url: `/api/internal/article-runs/${runId}/advance`, params: { id: runId } });
    const expiredAt = Date.now() - 1_000;
    const expired = await callRoute(advanceRoute, {
      method: "POST",
      url: `/api/internal/article-runs/${runId}/advance`,
      params: { id: runId },
      headers: { "x-job-expires": String(expiredAt), "x-job-signature": signJobStep(articleRunStepId(runId), expiredAt) },
    });
    expect([unsigned.status, expired.status]).toEqual([401, 401]);
  });

  it("il proxy lascia passare la rotta senza sessione, che resta protetta dalla firma", async () => {
    const response = await proxy(new NextRequest(new URL("/api/internal/article-runs/run-1/advance", "http://localhost:3000"), { method: "POST" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("continuazione di produzione dei lavori degli articoli", () => {
  it("POST firmata con articleRunStepId verso la rotta degli articoli di VERCEL_URL", async () => {
    vi.stubEnv("VERCEL_URL", "seogodmode-abc123.vercel.app");
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    scheduleArticleRunContinuation("run-123");
    expect(fetchMock).not.toHaveBeenCalled();
    await flushAfter();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://seogodmode-abc123.vercel.app/api/internal/article-runs/run-123/advance");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-job-signature"]).toBe(signJobStep(articleRunStepId("run-123"), Number(headers["x-job-expires"])));
    vi.stubEnv("VERCEL_URL", "");
  });
});
