import { JobStatus } from "@prisma/client";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";

export async function enqueueExtractionJob(projectId: string, subprojectId: string) {
  return prisma.job.create({
    data: {
      project_id: projectId,
      subproject_id: subprojectId,
      type: "extraction",
      status: "pending",
      payload: { projectId, subprojectId },
    },
  });
}

export async function runJobById(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== "pending" && job.status !== "running") {
    return job;
  }

  const lock = await prisma.job.updateMany({
    where: { id: job.id, status: { in: ["pending", "running"] } },
    data: { status: "running", started_at: new Date() },
  });

  if (lock.count === 0) {
    return prisma.job.findUnique({ where: { id: job.id } });
  }

  try {
    const summary = await runExtractionPipeline(job.subproject_id);
    // await: un errore dell'aggiornamento finale passa dal catch e il job termina failed.
    return await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completed_at: new Date(),
        result: summary,
      },
    });
  } catch (error) {
    return prisma.job.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completed_at: new Date(),
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export async function runQueuedExtractionJobs(limit = 1) {
  const jobs = await prisma.job.findMany({
    where: { status: "pending", type: "extraction" },
    orderBy: { created_at: "asc" },
    take: Math.max(1, limit),
  });

  const results = [];
  for (const job of jobs) {
    const result = await runJobById(job.id);
    results.push(result);
  }

  return results.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function getJobStats() {
  const [pending, running, failed] = await Promise.all([
    prisma.job.count({ where: { status: "pending" as JobStatus } }),
    prisma.job.count({ where: { status: "running" as JobStatus } }),
    prisma.job.count({ where: { status: "failed" as JobStatus } }),
  ]);

  return { pending, running, failed };
}
