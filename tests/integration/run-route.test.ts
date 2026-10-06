// Gate di T-305 (AC-305-1, AC-305-2): un'estrazione fallita risponde 500 e il job termina failed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as runProject } from "@/app/api/projects/[id]/run/route";
import { POST as runSection } from "@/app/api/projects/[id]/subprojects/[subprojectId]/run/route";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/modules/pipeline/extraction", () => ({ runExtractionPipeline: vi.fn() }));

const pipeline = vi.mocked(runExtractionPipeline);

async function createOwnedSection() {
  const { user, cookie } = await createUserWithSession({ username: "t305-owner" });
  const project = await prisma.project.create({ data: { name: "Progetto T-305", owner_user_id: user.id } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  return { cookie, projectId: project.id, sectionId: section.id };
}

beforeEach(async () => {
  pipeline.mockReset();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rotte di esecuzione con pipeline in errore", () => {
  // covers: AC-305-1
  it("rispondono 500 con JOB_FAILED e jobId, senza il messaggio interno, e il job è failed", async () => {
    pipeline.mockRejectedValue(new Error("errore Prisma con dettaglio-interno dell'host"));
    const { cookie, projectId, sectionId } = await createOwnedSection();

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
        url: `/api/projects/${projectId}/subprojects/${sectionId}/run`,
        cookie,
        params: { id: projectId, subprojectId: sectionId },
      }),
    ];

    for (const response of responses) {
      const text = await response.text();
      const body = JSON.parse(text) as { code?: string; jobId?: string };

      expect(response.status).toBe(500);
      expect(body.code).toBe("JOB_FAILED");
      expect(body.jobId).toEqual(expect.any(String));
      expect(text).not.toContain("dettaglio-interno");

      const job = await prisma.job.findUniqueOrThrow({ where: { id: body.jobId } });
      expect(job.status).toBe("failed");
      expect(job.completed_at).not.toBeNull();
    }
  });
});

describe("runJobById con aggiornamento finale in errore", () => {
  // covers: AC-305-2
  it("si risolve con il job failed e la riga non resta running", async () => {
    pipeline.mockResolvedValue({ queries: 1, rawSuggestions: 1, dedupedCandidates: 1, storedCandidates: 1 });
    const { projectId, sectionId } = await createOwnedSection();
    const { job } = await enqueueExtractionJob(projectId, sectionId);
    vi.spyOn(prisma.job, "update").mockRejectedValueOnce(new Error("aggiornamento a completed non riuscito"));

    const result = await runJobById(job.id);

    expect(result?.status).toBe("failed");
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("failed");
  });
});
