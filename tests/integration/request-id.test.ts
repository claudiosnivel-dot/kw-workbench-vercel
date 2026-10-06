// Gate di T-602 (AC-602-3, AC-602-4): x-request-id assegnato dal proxy e fallimenti dei job nel log.
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// impacted-by: T-1202 (runJobById esegue il job con advanceJob, non più con runExtractionPipeline)
vi.mock("@/lib/modules/jobs/advance-job", () => ({ advanceJob: vi.fn() }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.mocked(advanceJob).mockReset();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function anonymousApiCall(requestId?: string) {
  const headers = new Headers(requestId === undefined ? {} : { "x-request-id": requestId });
  const response = await proxy(new NextRequest(new URL("/api/projects", "http://localhost:3000"), { headers }));
  const body = (await response.json()) as { requestId?: string };
  return { status: response.status, header: response.headers.get("x-request-id"), requestId: body.requestId };
}

describe("x-request-id nel proxy", () => {
  // covers: AC-602-3
  it("genera un UUID se manca, riusa un valore conforme e sostituisce uno troppo lungo; il 401 riporta lo stesso valore", async () => {
    const missing = await anonymousApiCall();
    const valid = await anonymousApiCall("abc-12345678");
    const tooLong = await anonymousApiCall("a".repeat(200));

    expect(missing.status).toBe(401);
    expect(missing.header).toMatch(UUID);
    expect(valid.header).toBe("abc-12345678");
    expect(tooLong.header).toMatch(UUID);
    expect(tooLong.header).not.toBe(missing.header);
    for (const result of [missing, valid, tooLong]) {
      expect(result.requestId).toBe(result.header);
    }
  });
});

describe("job di estrazione fallito", () => {
  // covers: AC-602-4
  it("termina failed e il logger emette job_failed con jobId e lo stack dell'errore", async () => {
    const { user } = await createUserWithSession({ username: "t602-owner" });
    const project = await prisma.project.create({ data: { name: "Progetto T-602", owner_user_id: user.id } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    const { job } = await enqueueExtractionJob(project.id, section.id);
    vi.mocked(advanceJob).mockRejectedValueOnce(new Error("provider down"));
    const written: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });

    const result = await runJobById(job.id);

    expect(result?.status).toBe("failed");
    const entries = written
      .join("")
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as { level?: string; msg?: string; jobId?: string; error?: { stack?: string } });
    const failure = entries.find((entry) => entry.msg === "job_failed");
    expect(failure?.level).toBe("error");
    expect(failure?.jobId).toBe(job.id);
    expect(failure?.error?.stack).toContain("provider down");
  });
});
