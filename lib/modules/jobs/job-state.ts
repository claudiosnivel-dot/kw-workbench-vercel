import { Prisma, type Job, type JobStatus } from "@/lib/generated/prisma/client";
import { NoSeedsError } from "@/lib/modules/pipeline/errors";
import { jobProject, touchProjectActivity } from "@/lib/modules/project-activity";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/** Stati di un job ancora da eseguire o in esecuzione: al massimo uno per sezione (T-1201). */
export const ACTIVE_JOB_STATUSES: JobStatus[] = ["pending", "running"];

const MAX_PUBLIC_ERROR_LENGTH = 500;

/**
 * Messaggio salvato in jobs.error_message e mostrato all'utente (T-706, CWE-209): mai il dettaglio di
 * un errore Prisma (host, query, vincoli), che resta solo nel log del server.
 */
export function toPublicJobError(error: unknown): string {
  if (error instanceof NoSeedsError) {
    return "La sezione non ha seed: aggiungi almeno una seed prima di avviare l'estrazione";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `Errore del database durante il salvataggio dei risultati (${error.code})`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_PUBLIC_ERROR_LENGTH);
}

/**
 * Porta a failed un job ancora attivo con il messaggio pubblico, rilascia il lease ed elimina lo staging; i
 * keyword_candidates della sezione non cambiano. false se il job era già terminato nel frattempo.
 */
export async function failActiveJob(job: Pick<Job, "id" | "project_id">, message: string): Promise<boolean> {
  const now = new Date();
  const failed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { count } = await tx.job.updateMany({
      where: { id: job.id, status: { in: ACTIVE_JOB_STATUSES } },
      data: { status: "failed", completed_at: now, error_message: message, locked_until: null },
    });
    if (count === 0) {
      return false;
    }
    await tx.jobSuggestion.deleteMany({ where: { job_id: job.id } });
    await tx.jobMetric.deleteMany({ where: { job_id: job.id } });
    await touchProjectActivity(tx, jobProject(job), now);
    return true;
  });
  return failed;
}

/**
 * Fallimento definitivo per tetto di tentativi (T-1203): messaggio generico con il solo numero di tentativi, mai il
 * dettaglio interno; una riga di log con jobId e tentativi (CWE-778).
 */
export async function failJobAfterAttempts(job: Pick<Job, "id" | "project_id">, attempts: number): Promise<boolean> {
  const failed = await failActiveJob(job, `Estrazione interrotta dopo ${attempts} tentativi`);
  if (failed) {
    logger.error("job_attempts_exhausted", { jobId: job.id, attempts });
  }
  return failed;
}
