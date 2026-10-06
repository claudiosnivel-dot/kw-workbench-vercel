import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import type { Job, JobStatus } from "@/lib/generated/prisma/client";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { prisma } from "@/lib/prisma";

/**
 * Job del progetto dell'utente della sessione in una sola query (T-1204, CWE-639): id e proprietario nello stesso
 * where. Sessione assente -> 401; job di altri utenti o inesistente -> 404 JOB_NOT_FOUND, mai 403. Con T-1502 il
 * proprietario diventa la membership del workspace.
 */
export async function requireOwnedJob(request: Request, params: Promise<{ id: string }>): Promise<Job> {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id, project: { owner_user_id: user.id } } });
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

/**
 * Job pending o running della sezione da mostrare al ricaricamento (T-1205): è sempre l'ultimo creato, perché
 * l'indice jobs_one_active_per_subproject impedisce un nuovo job finché uno è attivo.
 */
export function activeJobIdOf(latest: { id: string; status: JobStatus } | null | undefined): string | null {
  return latest && ACTIVE_JOB_STATUSES.includes(latest.status) ? latest.id : null;
}

/** Id del job pending o running della sezione, letto lato server da una pagina già autorizzata; null se non c'è. */
export async function findActiveJobId(subprojectId: string): Promise<string | null> {
  const job = await prisma.job.findFirst({
    where: { subproject_id: subprojectId, status: { in: ACTIVE_JOB_STATUSES } },
    select: { id: true },
  });
  return job?.id ?? null;
}
