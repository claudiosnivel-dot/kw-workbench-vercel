import type { Job } from "@/lib/generated/prisma/client";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

/**
 * Job del progetto dell'utente in una sola query (T-1204, CWE-639): id e proprietario nello stesso where. Job di
 * altri utenti o inesistente -> 404 JOB_NOT_FOUND, mai 403. Con T-1502 il proprietario diventa la membership del
 * workspace.
 */
export async function findOwnedJob(jobId: string, userId: string): Promise<Job> {
  const job = await prisma.job.findFirst({ where: { id: jobId, project: { owner_user_id: userId } } });
  if (!job) {
    throw new AppError(404, JOB_ERROR_CODES.notFound, "Job non trovato");
  }
  return job;
}

/** Body dello stato: result solo a completed, error solo il messaggio pubblico salvato (mai stack, CWE-209). */
export function jobStatusBody(job: Job) {
  return {
    data: {
      id: job.id,
      status: job.status,
      phase: job.phase,
      progress: { done: job.progress_done, total: job.progress_total },
      result: job.status === "completed" ? job.result : null,
      error: job.status === "failed" ? job.error_message : null,
    },
  };
}

/**
 * Annulla il job: pending -> canceled subito; running -> cancel_requested, l'annullamento avviene al batch successivo
 * (T-1202); già terminato -> 409 JOB_NOT_CANCELABLE. Ogni passaggio è un updateMany condizionale sullo stato, così
 * un job partito nel frattempo riceve la richiesta invece di essere chiuso a metà batch.
 */
export async function cancelOwnedJob(jobId: string): Promise<"canceled" | "running"> {
  const pending = await prisma.job.updateMany({
    where: { id: jobId, status: "pending" },
    data: { status: "canceled", completed_at: new Date() },
  });
  if (pending.count === 1) {
    return "canceled";
  }

  const running = await prisma.job.updateMany({
    where: { id: jobId, status: "running" },
    data: { cancel_requested: true },
  });
  if (running.count === 1) {
    return "running";
  }

  throw new AppError(409, JOB_ERROR_CODES.notCancelable, "Il job è già terminato");
}
