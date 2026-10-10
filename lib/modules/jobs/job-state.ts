import * as Sentry from "@sentry/nextjs";
import { getBillingPolicy } from "@/lib/billing/plans";
import {
  isFreeCancel,
  type RefundOutcome,
  refundRunReservation,
  releaseCanceledRun,
  type RunReservation,
} from "@/lib/billing/usage";
import { Prisma, type Job, type JobFailureCause, type JobStatus } from "@/lib/generated/prisma/client";
import { NoSeedsError } from "@/lib/modules/pipeline/errors";
import { jobProject, touchProjectActivity } from "@/lib/modules/project-activity";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/** Stati di un job ancora da eseguire o in esecuzione: al massimo uno per sezione (T-1201). */
export const ACTIVE_JOB_STATUSES: JobStatus[] = ["pending", "running"];

const MAX_PUBLIC_ERROR_LENGTH = 500;

/**
 * Causa del fallimento (T-1703, D-27 emendata): USER per un input non valido dell'utente (sezione senza seed), INTERNAL
 * per ogni altro errore (eccezione non prevista, DB, fornitore esterno non disponibile), che restituisce la quota.
 */
export function failureCauseOf(error: unknown): JobFailureCause {
  return error instanceof NoSeedsError ? "USER" : "INTERNAL";
}

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

/** Riserva della quota salvata all'avvio nel payload del job (T-1703); assente con il lancio in pausa. */
function runReservationOf(payload: Prisma.JsonValue | null): RunReservation | null {
  const quota = (payload as { quota?: RunReservation } | null)?.quota;
  return quota?.workspaceId && quota.runsPeriodStart ? quota : null;
}

/**
 * Annullamento gratuito (T-2002, D-27 emendata): chiamata nella transazione che porta il job a canceled. Se la prima
 * richiesta di annullamento (cancel_requested_at) cade entro FREE_CANCEL_WINDOW_MS da created_at e l'avvio aveva una
 * quota riservata, l'avvio torna al workspace fuori dal tetto dei rimborsi; altrimenti la quota resta consumata.
 */
export async function releaseQuotaOnCancel(tx: Prisma.TransactionClient, jobId: string): Promise<void> {
  const job = await tx.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { created_at: true, cancel_requested_at: true, payload: true },
  });
  const reservation = runReservationOf(job.payload);
  if (reservation && job.cancel_requested_at && isFreeCancel(job.created_at, job.cancel_requested_at)) {
    await releaseCanceledRun(tx, { jobId, reservation });
  }
}

/**
 * Porta a failed un job ancora attivo con il messaggio pubblico e la causa (T-1703, D-27 emendata: INTERNAL per un
 * errore nostro, USER per un input non valido), rilascia il lease ed elimina lo staging; i keyword_candidates della
 * sezione non cambiano. Con causa INTERNAL e una quota riservata all'avvio, nella stessa transazione il rimborso entro
 * il tetto mensile; oltre il tetto un messaggio a Sentry e una riga di log per l'admin. false se il job era già
 * terminato nel frattempo.
 */
export async function failActiveJob(job: Pick<Job, "id" | "project_id">, message: string, cause: JobFailureCause): Promise<boolean> {
  const now = new Date();
  const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<RefundOutcome | "failed" | null> => {
    const { count } = await tx.job.updateMany({
      where: { id: job.id, status: { in: ACTIVE_JOB_STATUSES } },
      data: { status: "failed", completed_at: now, error_message: message, locked_until: null, failure_cause: cause },
    });
    if (count === 0) {
      return null;
    }
    await tx.jobSuggestion.deleteMany({ where: { job_id: job.id } });
    await tx.jobMetric.deleteMany({ where: { job_id: job.id } });
    await touchProjectActivity(tx, jobProject(job), now);

    const { payload } = await tx.job.findUniqueOrThrow({ where: { id: job.id }, select: { payload: true } });
    const reservation = runReservationOf(payload);
    if (cause !== "INTERNAL" || !reservation) {
      return "failed";
    }
    return refundRunReservation(tx, { jobId: job.id, reservation, refundCap: getBillingPolicy().runRefundsPerMonth, now });
  });

  if (outcome === "cap_reached") {
    logger.error("quota_refund_cap_reached", { jobId: job.id });
    Sentry.captureMessage("quota_refund_cap_reached", { level: "warning", extra: { jobId: job.id } });
  }
  return outcome !== null;
}

/**
 * Fallimento definitivo per tetto di tentativi (T-1203): messaggio generico con il solo numero di tentativi, mai il
 * dettaglio interno; una riga di log con jobId e tentativi (CWE-778). È un errore nostro: causa INTERNAL (T-1703).
 */
export async function failJobAfterAttempts(job: Pick<Job, "id" | "project_id">, attempts: number): Promise<boolean> {
  const failed = await failActiveJob(job, `Estrazione interrotta dopo ${attempts} tentativi`, "INTERNAL");
  if (failed) {
    logger.error("job_attempts_exhausted", { jobId: job.id, attempts });
  }
  return failed;
}
