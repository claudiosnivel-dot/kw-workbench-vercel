import { Prisma, type Job } from "@/lib/generated/prisma/client";
import { NoSeedsError } from "@/lib/modules/pipeline/errors";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

type DriverAdapterFailure = { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };

/** Violazione di un vincolo unico: P2002 di Prisma o SQLSTATE 23505 riportato dal driver adapter. */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  return error.code === "P2002" || (error as DriverAdapterFailure).meta?.driverAdapterError?.cause?.originalCode === "23505";
}

// Un job concluso tra la violazione dell'indice e la rilettura libera la sezione: si riprova l'inserimento.
const ENQUEUE_ATTEMPTS = 3;

/**
 * Crea il job di estrazione della sezione (T-1201). L'indice parziale jobs_one_active_per_subproject ammette un solo
 * job pending o running per sezione: se esiste già, restituisce quello con created=false invece di propagare la
 * violazione (nessun controllo check-then-insert, CWE-362).
 */
export async function enqueueExtractionJob(projectId: string, subprojectId: string): Promise<{ job: Job; created: boolean }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const job = await prisma.job.create({
        data: {
          project_id: projectId,
          subproject_id: subprojectId,
          type: "extraction",
          status: "pending",
          payload: { projectId, subprojectId },
        },
      });
      return { job, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const active = await prisma.job.findFirst({
        where: { subproject_id: subprojectId, status: { in: ["pending", "running"] } },
      });
      if (active) {
        return { job: active, created: false };
      }
      if (attempt >= ENQUEUE_ATTEMPTS) {
        throw error;
      }
    }
  }
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
