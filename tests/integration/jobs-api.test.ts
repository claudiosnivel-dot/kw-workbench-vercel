// Gate di T-1204 (AC-1204-1…AC-1204-4): avvio 202 senza pipeline nella richiesta, 409 sul job già attivo, stato e
// annullamento nel perimetro del proprietario del progetto. La continuazione è sostituita da un registratore.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancelJob } from "@/app/api/jobs/[id]/cancel/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  scheduleJobContinuation: vi.fn(),
}));

const registrar = vi.mocked(scheduleJobContinuation);

type Owner = { cookie: string; projectId: string; sectionId: string };

async function createOwner(username: string): Promise<Owner> {
  const { user, cookie } = await createUserWithSession({ displayName: username });
  const project = await prisma.project.create({
    data: { name: `Progetto ${username}`, owner_user_id: user.id, autocomplete_provider: "MOCK", metrics_provider: "MOCK" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.createMany({
    data: ["caffe moka", "caffe espresso", "caffe solubile"].map((keyword) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword,
    })),
  });
  return { cookie, projectId: project.id, sectionId: section.id };
}

function startRun(owner: Owner) {
  return callRoute(runProject, {
    method: "POST",
    url: `/api/projects/${owner.projectId}/run`,
    cookie: owner.cookie,
    body: { subprojectId: owner.sectionId },
    params: { id: owner.projectId },
  });
}

function readJob(jobId: string, cookie?: string) {
  return callRoute(getJob, { url: `/api/jobs/${jobId}`, cookie, params: { id: jobId } });
}

function requestCancel(jobId: string, cookie: string) {
  return callRoute(cancelJob, { method: "POST", url: `/api/jobs/${jobId}/cancel`, cookie, params: { id: jobId } });
}

async function insertJob(owner: Owner, status: "pending" | "running", extra: Record<string, unknown> = {}) {
  return prisma.job.create({
    data: { project_id: owner.projectId, subproject_id: owner.sectionId, status, ...extra },
  });
}

beforeEach(async () => {
  registrar.mockClear();
  await resetDatabase();
});

describe("avvio dell'estrazione", () => {
  // covers: AC-1204-1
  it("risponde 202 con jobId e Location, il job resta pending, 1 continuazione e nessuna candidata scritta", async () => {
    const owner = await createOwner("t1204-a");
    const candidatesBefore = await prisma.keywordCandidate.count({ where: { subproject_id: owner.sectionId } });

    const response = await startRun(owner);
    const body = (await response.json()) as { data: { jobId: string; status: string; phase: string } };

    expect(response.status).toBe(202);
    expect(body.data.jobId).toEqual(expect.any(String));
    expect(body.data.jobId).not.toBe("");
    expect(response.headers.get("Location")).toBe(`/api/jobs/${body.data.jobId}`);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: body.data.jobId } });
    expect(job.status).toBe("pending");
    expect(registrar.mock.calls).toEqual([[body.data.jobId]]);
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: owner.sectionId } })).toBe(candidatesBefore);
  });

  // covers: AC-1204-2
  it("con un job pending sulla sezione risponde 409 JOB_ALREADY_ACTIVE con lo stesso jobId", async () => {
    const owner = await createOwner("t1204-a");
    const first = (await (await startRun(owner)).json()) as { data: { jobId: string } };
    const jobsBefore = await prisma.job.count({ where: { subproject_id: owner.sectionId } });

    const response = await startRun(owner);
    const body = (await response.json()) as { code?: string; jobId?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("JOB_ALREADY_ACTIVE");
    expect(body.jobId).toBe(first.data.jobId);
    expect(await prisma.job.count({ where: { subproject_id: owner.sectionId } })).toBe(jobsBefore);
  });
});

describe("stato del job", () => {
  // covers: AC-1204-3
  it("200 al proprietario con fase e avanzamento e Cache-Control no-store, 404 a un altro utente, 401 senza sessione", async () => {
    const owner = await createOwner("t1204-a");
    const other = await createOwner("t1204-b");
    const job = await insertJob(owner, "running", { phase: "autocomplete", progress_done: 5, progress_total: 20 });

    const own = await readJob(job.id, owner.cookie);
    const foreign = await readJob(job.id, other.cookie);
    const anonymous = await readJob(job.id);

    expect(own.status).toBe(200);
    const body = (await own.json()) as { data: { phase: string; progress: { done: number; total: number } } };
    expect(body.data.phase).toBe("autocomplete");
    expect(body.data.progress).toEqual({ done: 5, total: 20 });
    expect(own.headers.get("Cache-Control")).toBe("no-store");
    expect(foreign.status).toBe(404);
    expect(((await foreign.json()) as { code?: string }).code).toBe("JOB_NOT_FOUND");
    expect(anonymous.status).toBe(401);
  });
});

describe("annullamento del job", () => {
  // covers: AC-1204-4
  it("404 a un altro utente, 200 poi 409 sul pending del proprietario, 202 sul running con cancel_requested", async () => {
    const owner = await createOwner("t1204-a");
    const other = await createOwner("t1204-b");
    const pending = await insertJob(owner, "pending");
    const secondSection = await prisma.subproject.create({ data: { project_id: owner.projectId, name: "Seconda", position: 1 } });
    const running = await prisma.job.create({
      data: { project_id: owner.projectId, subproject_id: secondSection.id, status: "running", phase: "autocomplete" },
    });

    const foreign = await requestCancel(pending.id, other.cookie);
    expect(foreign.status).toBe(404);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("pending");

    const first = await requestCancel(pending.id, owner.cookie);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { data: { status: string } }).data.status).toBe("canceled");
    const second = await requestCancel(pending.id, owner.cookie);
    expect(second.status).toBe(409);
    expect(((await second.json()) as { code?: string }).code).toBe("JOB_NOT_CANCELABLE");

    const onRunning = await requestCancel(running.id, owner.cookie);
    expect(onRunning.status).toBe(202);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: running.id } })).cancel_requested).toBe(true);
  });
});
