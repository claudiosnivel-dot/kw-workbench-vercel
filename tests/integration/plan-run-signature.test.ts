// Gate di T-6201 (AC-6201-5): la rotta interna di un lavoro di piano accetta solo la firma HMAC di «plan-run:» più l'id;
// la firma valida di un job delle ricerche o di un lavoro di articolo con lo stesso id riceve 401 e il lavoro non cambia.
// In più il proxy che lascia passare la rotta senza sessione e la continuazione di produzione verso la rotta dei piani.
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as advanceRoute } from "@/app/api/internal/plan-runs/[id]/advance/route";
import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { articleRunStepId, planRunStepId, signJobStep } from "@/lib/modules/jobs/job-signature";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { clearAfter, flushAfter } from "../helpers/next-after";

const fetchMock = vi.fn<typeof fetch>();

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("JOB_SIGNING_SECRET", randomBytes(24).toString("hex"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** Lavoro pending di un piano avviato dal proprietario del progetto, con la coda di after() svuotata dopo l'avvio. */
async function pendingRun(): Promise<string> {
  const owner = await createUserWithSession();
  const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId, language_code: "it" } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "S", position: 0 } });
  await prisma.keywordCandidate.create({
    data: {
      project_id: project.id,
      subproject_id: section.id,
      keyword: "scarpe running",
      normalized_keyword: "scarpe running",
      canonical_keyword: "scarpe running",
      source: "seed",
      source_query: "scarpe running",
      avg_monthly_searches: 100,
    },
  });
  const response = await callRoute(createStrategy, {
    method: "POST",
    url: `/api/projects/${project.id}/strategies`,
    cookie: owner.cookie,
    params: { id: project.id },
    body: { mode: "AUTO" },
  });
  clearAfter();
  return ((await response.json()) as { data: { runId: string } }).data.runId;
}

function callAdvance(runId: string, signed: string) {
  const expiresAt = Date.now() + 60_000;
  return callRoute(advanceRoute, {
    method: "POST",
    url: `/api/internal/plan-runs/${runId}/advance`,
    params: { id: runId },
    headers: { "x-job-expires": String(expiresAt), "x-job-signature": signJobStep(signed, expiresAt) },
  });
}

describe("rotta interna dei lavori di piano", () => {
  // covers: AC-6201-5
  it("con la firma di un job delle ricerche o di un lavoro di articolo risponde 401 e il lavoro non cambia; con la firma giusta 202", async () => {
    const runId = await pendingRun();
    const before = await prisma.planRun.findUniqueOrThrow({ where: { id: runId } });

    const jobSigned = await callAdvance(runId, runId);
    const articleSigned = await callAdvance(runId, articleRunStepId(runId));
    await flushAfter();

    expect([jobSigned.status, articleSigned.status]).toEqual([401, 401]);
    expect(await jobSigned.json()).toMatchObject({ code: "JOB_SIGNATURE_INVALID" });
    expect(await articleSigned.json()).toMatchObject({ code: "JOB_SIGNATURE_INVALID" });
    expect(await prisma.planRun.findUniqueOrThrow({ where: { id: runId } })).toEqual(before);

    const signed = await callAdvance(runId, planRunStepId(runId));
    expect(signed.status).toBe(202);
    expect(await signed.json()).toEqual({ data: { runId } });
    await flushAfter();
    const run = await prisma.planRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("completed");
    expect(run.strategy_id).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("firma assente o scaduta risponde 401", async () => {
    const runId = await pendingRun();
    const unsigned = await callRoute(advanceRoute, { method: "POST", url: `/api/internal/plan-runs/${runId}/advance`, params: { id: runId } });
    const expiredAt = Date.now() - 1_000;
    const expired = await callRoute(advanceRoute, {
      method: "POST",
      url: `/api/internal/plan-runs/${runId}/advance`,
      params: { id: runId },
      headers: { "x-job-expires": String(expiredAt), "x-job-signature": signJobStep(planRunStepId(runId), expiredAt) },
    });
    expect([unsigned.status, expired.status]).toEqual([401, 401]);
    expect(await prisma.planRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("il proxy lascia passare la rotta senza sessione, che resta protetta dalla firma", async () => {
    const response = await proxy(new NextRequest(new URL("/api/internal/plan-runs/run-1/advance", "http://localhost:3000"), { method: "POST" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("continuazione di produzione dei lavori di piano", () => {
  it("POST firmata con planRunStepId verso la rotta dei piani di VERCEL_URL", async () => {
    vi.stubEnv("VERCEL_URL", "seogodmode-abc123.vercel.app");
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    schedulePlanRunContinuation("run-123");
    expect(fetchMock).not.toHaveBeenCalled();
    await flushAfter();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://seogodmode-abc123.vercel.app/api/internal/plan-runs/run-123/advance");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-job-signature"]).toBe(signJobStep(planRunStepId("run-123"), Number(headers["x-job-expires"])));
    vi.stubEnv("VERCEL_URL", "");
  });
});
