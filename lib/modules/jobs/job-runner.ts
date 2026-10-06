import { Prisma, type Job } from "@/lib/generated/prisma/client";
import { getIntEnv } from "@/lib/env";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { ACTIVE_JOB_STATUSES, failActiveJob, toPublicJobError } from "@/lib/modules/jobs/job-state";
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
        where: { subproject_id: subprojectId, status: { in: ACTIVE_JOB_STATUSES } },
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

/**
 * Esegue il job fino alla fine nel processo corrente con passi di JOB_STEP_BUDGET_MS (test e CLI; le rotte lo
 * avviano in background, T-1204). Un'eccezione di un passo porta subito il job a failed con il messaggio pubblico.
 */
export async function runJobById(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    for (;;) {
      const step = await advanceJob(job.id, Date.now() + getIntEnv("JOB_STEP_BUDGET_MS"));
      if (!step.more) {
        break;
      }
    }
  } catch (error) {
    // Stack completo solo nel log, correlabile con l'evento di Sentry (T-602); nel DB il messaggio pubblico (T-706).
    logger.error("job_failed", { jobId: job.id, projectId: job.project_id, subprojectId: job.subproject_id, error });
    await failActiveJob(job, toPublicJobError(error));
  }

  return prisma.job.findUnique({ where: { id: job.id } });
}
