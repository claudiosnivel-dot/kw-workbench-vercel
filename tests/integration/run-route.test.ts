// Gate di T-305 (AC-305-1, AC-305-2): un'estrazione fallita non risulta riuscita e il job termina failed.
// impacted-by: T-1204 (le rotte run rispondono 202 e il job gira in background: l'esito failed si legge dallo stato
// del job; AC-305-1 emendato nel modulo 03)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { POST as runSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { runJobStep } from "@/lib/modules/jobs/job-step";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

// impacted-by: T-1202 (runJobById esegue il job con advanceJob, non più con runExtractionPipeline)
vi.mock("@/lib/modules/jobs/advance-job", () => ({ advanceJob: vi.fn() }));
vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

const pipeline = vi.mocked(advanceJob);

async function createOwnedSections() {
  const { user, cookie } = await createUserWithSession({ displayName: "t305-owner" });
  const project = await prisma.project.create({ data: { name: "Progetto T-305", workspace_id: await personalWorkspaceId(user.id) } });
  const first = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  const second = await prisma.subproject.create({ data: { project_id: project.id, name: "Seconda", position: 1 } });
  return { cookie, projectId: project.id, sectionId: first.id, secondSectionId: second.id };
}

beforeEach(async () => {
  pipeline.mockReset();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rotte di esecuzione con pipeline in errore", () => {
  // covers: AC-305-1
  it("avviano il job con 202; in background il job termina failed e lo stato non contiene il messaggio interno", async () => {
    vi.stubEnv("JOB_MAX_ATTEMPTS", "1");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    pipeline.mockRejectedValue(new Error("errore Prisma con dettaglio-interno dell'host"));
    const { cookie, projectId, sectionId, secondSectionId } = await createOwnedSections();

    const responses = [
      await callRoute(runProject, {
        method: "POST",
        url: `/api/projects/${projectId}/run`,
        cookie,
        body: { subprojectId: sectionId },
        params: { id: projectId },
      }),
      await callRoute(runSection, {
        method: "POST",
        url: `/api/projects/${projectId}/subprojects/${secondSectionId}/run`,
        cookie,
        params: { id: projectId, subprojectId: secondSectionId },
      }),
    ];

    for (const response of responses) {
      const { data } = (await response.json()) as { data: { jobId: string } };
      expect(response.status).toBe(202);
      expect(data.jobId).toEqual(expect.any(String));

      await runJobStep(data.jobId);
      const state = await callRoute(getJob, { url: `/api/jobs/${data.jobId}`, cookie, params: { id: data.jobId } });
      const text = await state.text();

      expect(state.status).toBe(200);
      expect((JSON.parse(text) as { data: { status: string } }).data.status).toBe("failed");
      expect(text).not.toContain("dettaglio-interno");
      const job = await prisma.job.findUniqueOrThrow({ where: { id: data.jobId } });
      expect(job.status).toBe("failed");
      expect(job.completed_at).not.toBeNull();
    }
  });
});

describe("runJobById con aggiornamento finale in errore", () => {
  // covers: AC-305-2
  it("si risolve con il job failed e la riga non resta running", async () => {
    const { projectId, sectionId } = await createOwnedSections();
    const { job } = await enqueueExtractionJob(projectId, sectionId);
    // impacted-by: T-1202 (il completamento è nella transazione dell'ultimo passo: il suo errore esce da advanceJob)
    pipeline.mockRejectedValueOnce(new Error("aggiornamento a completed non riuscito"));

    const result = await runJobById(job.id);

    expect(result?.status).toBe("failed");
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("failed");
  });
});
