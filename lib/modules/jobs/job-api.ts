import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { canPerform, type WorkspaceAction } from "@/lib/authz/permissions";
import { projectAccessWhere } from "@/lib/authz/workspace";
import type { Job, JobStatus } from "@/lib/generated/prisma/client";
import { AppError, ForbiddenError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { ACTIVE_JOB_STATUSES, releaseQuotaOnCancel } from "@/lib/modules/jobs/job-state";
import { prisma } from "@/lib/prisma";

/** Job autorizzato per un'azione, con il perimetro delle scritture sul suo progetto (T-1502). */
export type AuthorizedJob = { job: Job; perimeter: ReturnType<typeof projectAccessWhere> };

/**
 * Job di un progetto di un workspace dell'utente della sessione in una sola query (T-1204, T-1502, CWE-639): id e
 * membership nello stesso where. Sessione assente -> 401; non membro o job inesistente -> 404 JOB_NOT_FOUND;
 * membro senza il ruolo dell'azione -> 403 FORBIDDEN.
 */
export async function requireJobAccess(
  request: Request,
  params: Promise<{ id: string }>,
  action: WorkspaceAction
): Promise<AuthorizedJob> {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await params;
  const row = await prisma.job.findFirst({
    where: { id, project: projectAccessWhere(user.id) },
    include: {
      project: { select: { workspace_id: true, workspace: { select: { memberships: { where: { user_id: user.id }, select: { role: true } } } } } },
    },
  });
  if (!row) {
    throw new AppError(404, JOB_ERROR_CODES.notFound, "Job non trovato");
  }

  const { project, ...job } = row;
  if (!canPerform(project.workspace.memberships[0].role, action)) {
    throw new ForbiddenError();
  }
  return { job, perimeter: { workspace_id: project.workspace_id, ...projectAccessWhere(user.id, action) } };
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
 * un job partito nel frattempo riceve la richiesta invece di essere chiuso a metà batch. La prima richiesta fissa
 * cancel_requested_at: entro 60 secondi dall'avvio la quota torna al workspace quando il job diventa canceled (T-2002),
 * subito per un pending, al batch successivo per un running; un job che nel frattempo si completa la consuma.
 */
export async function cancelAuthorizedJob({ job, perimeter }: AuthorizedJob): Promise<"canceled" | "running"> {
  // Perimetro del workspace nel where (T-1502): una membership revocata nel frattempo non annulla il job.
  const jobId = job.id;
  const now = new Date();
  const canceled = await prisma.$transaction(async (tx) => {
    const pending = await tx.job.updateMany({
      where: { id: jobId, status: "pending", project: perimeter },
      data: { status: "canceled", completed_at: now, cancel_requested_at: now },
    });
    if (pending.count === 1) {
      await releaseQuotaOnCancel(tx, jobId);
    }
    return pending.count === 1;
  });
  if (canceled) {
    return "canceled";
  }

  // Solo la prima richiesta fissa l'istante della finestra gratuita: una seconda non lo sposta.
  const first = await prisma.job.updateMany({
    where: { id: jobId, status: "running", cancel_requested_at: null, project: perimeter },
    data: { cancel_requested: true, cancel_requested_at: now },
  });
  const running =
    first.count === 1
      ? first
      : await prisma.job.updateMany({ where: { id: jobId, status: "running", project: perimeter }, data: { cancel_requested: true } });
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
