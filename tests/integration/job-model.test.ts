// Gate di T-1201 (AC-1201-1…AC-1201-4): un solo job attivo per sezione imposto dall'indice parziale, enqueue
// idempotente sotto concorrenza, default della fase e staging eliminato con il job.
import { beforeEach, describe, expect, it } from "vitest";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

async function createSection() {
  const { user } = await createUserWithSession({ displayName: "t1201-owner" });
  const project = await prisma.project.create({ data: { name: "Job T-1201", workspace_id: await personalWorkspaceId(user.id) } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  return { projectId: project.id, sectionId: section.id };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("indice jobs_one_active_per_subproject", () => {
  // covers: AC-1201-1
  it("esiste una sola volta, è unico e ha il predicato su pending e running", async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'jobs_one_active_per_subproject'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("UNIQUE");
    expect(rows[0].indexdef).toMatch(/WHERE .*status.*'pending'.*'running'/);
  });
});

describe("enqueueExtractionJob", () => {
  // covers: AC-1201-2
  it("due chiamate in parallelo producono un solo job attivo: created=true e created=false con lo stesso id", async () => {
    const { projectId, sectionId } = await createSection();

    const results = await Promise.all([
      enqueueExtractionJob(projectId, sectionId),
      enqueueExtractionJob(projectId, sectionId),
    ]);

    expect(await prisma.job.count({ where: { subproject_id: sectionId, status: { in: ["pending", "running"] } } })).toBe(1);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    expect(results[0].job.id).toBe(results[1].job.id);
  });

  // covers: AC-1201-3
  it("con un job completed crea un nuovo job con i default della fase", async () => {
    const { projectId, sectionId } = await createSection();
    await prisma.job.create({
      data: { project_id: projectId, subproject_id: sectionId, status: "completed", completed_at: new Date() },
    });

    const result = await enqueueExtractionJob(projectId, sectionId);

    expect(result.created).toBe(true);
    expect(await prisma.job.count({ where: { subproject_id: sectionId } })).toBe(2);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: result.job.id } });
    expect(job).toMatchObject({ phase: "expand", attempts: 0, cancel_requested: false, progress_done: 0 });
  });
});

describe("staging del job", () => {
  // covers: AC-1201-4
  it("eliminando il job spariscono le sue righe di job_suggestions e job_metrics", async () => {
    const { projectId, sectionId } = await createSection();
    const { job } = await enqueueExtractionJob(projectId, sectionId);
    await prisma.jobSuggestion.createMany({
      data: ["uno", "due", "tre"].map((keyword) => ({
        job_id: job.id,
        query_index: 0,
        keyword,
        source: "mock-autocomplete",
        source_query: "query",
      })),
    });
    await prisma.jobMetric.createMany({
      data: ["uno", "due"].map((canonical_keyword) => ({
        job_id: job.id,
        canonical_keyword,
        metrics_status: "mock" as const,
        metrics_provider: "MOCK" as const,
      })),
    });

    await prisma.job.delete({ where: { id: job.id } });

    expect(await prisma.jobSuggestion.count({ where: { job_id: job.id } })).toBe(0);
    expect(await prisma.jobMetric.count({ where: { job_id: job.id } })).toBe(0);
  });
});
