import { Prisma } from "@/lib/generated/prisma/client";
import { NoSeedsError } from "@/lib/modules/pipeline/errors";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { logger } from "@/lib/observability/logger";
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

const MAX_PUBLIC_ERROR_LENGTH = 500;

/**
 * Messaggio salvato in jobs.error_message e mostrato all'utente (T-706, CWE-209): mai il dettaglio di
 * un errore Prisma (host, query, vincoli), che resta solo nel log del server.
 */
function toPublicJobError(error: unknown): string {
  if (error instanceof NoSeedsError) {
    return "La sezione non ha seed: aggiungi almeno una seed prima di avviare l'estrazione";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `Errore del database durante il salvataggio dei risultati (${error.code})`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_PUBLIC_ERROR_LENGTH);
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
    const summary = await runExtractionPipeline(job.subproject_id, { jobId: job.id });
    // await: un errore dell'aggiornamento finale passa dal catch e il job termina failed.
    const completed = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "completed",
        completed_at: new Date(),
        result: summary,
      },
    });
    await touchProjectActivity(prisma, job.project_id, completed.completed_at ?? undefined);
    return completed;
  } catch (error) {
    // Stack completo solo nel log, correlabile con l'evento di Sentry (T-602); nel DB il messaggio pubblico (T-706).
    logger.error("job_failed", { jobId: job.id, projectId: job.project_id, subprojectId: job.subproject_id, error });
    const failed = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completed_at: new Date(),
        error_message: toPublicJobError(error),
      },
    });
    await touchProjectActivity(prisma, job.project_id, failed.completed_at ?? undefined);
    return failed;
  }
}

