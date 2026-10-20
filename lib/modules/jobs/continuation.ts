import { after } from "next/server";
import { getInternalBaseUrl, getProtectionBypassSecret } from "@/lib/env";
import { articleRunStepId, JOB_SIGNATURE_TTL_MS, signJobStep } from "@/lib/modules/jobs/job-signature";
import { logger } from "@/lib/observability/logger";

/** Pianificazione del passo successivo di un job, eseguito in un'altra invocazione (T-1203, D-10). */
export interface JobContinuation {
  schedule(jobId: string): void;
}

// La rotta interna risponde 202 subito: l'attesa riguarda solo la consegna della richiesta.
const CONTINUATION_TIMEOUT_MS = 10_000;

/**
 * Destinazione di una continuazione: percorso della rotta interna, stringa firmata e campi del log. Un job delle ricerche
 * firma il suo id (T-1203), un lavoro di articolo l'id con il prefisso di articleRunStepId (T-4101).
 */
type ContinuationTarget = { path: string; signed: string; fields: Record<string, string> };

async function postContinuation({ path, signed, fields }: ContinuationTarget): Promise<void> {
  const base = getInternalBaseUrl();
  if (!base) {
    logger.error("job_continuation_unconfigured", fields);
    return;
  }

  // Mai firma, bypass o header nei log (CWE-532): solo l'id e l'esito.
  try {
    const expiresAt = Date.now() + JOB_SIGNATURE_TTL_MS;
    const headers: Record<string, string> = {
      "x-job-expires": String(expiresAt),
      "x-job-signature": signJobStep(signed, expiresAt),
    };
    const bypass = getProtectionBypassSecret();
    if (bypass) {
      headers["x-vercel-protection-bypass"] = bypass;
    }

    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(CONTINUATION_TIMEOUT_MS),
    });
    if (response.status !== 202) {
      logger.error("job_continuation_rejected", { ...fields, status: response.status });
    }
  } catch (error) {
    logger.error("job_continuation_failed", { ...fields, error });
  }
}

/**
 * Implementazione di produzione: registra con after() una POST firmata verso /api/internal/jobs/{id}/advance della
 * stessa deployment (VERCEL_URL) o di APP_PUBLIC_URL, con x-vercel-protection-bypass se Vercel lo fornisce. Se la
 * consegna fallisce il job resta fermo finché il reaper non lo riprende (polling di stato o cron).
 */
const httpJobContinuation: JobContinuation = {
  schedule(jobId) {
    after(() => postContinuation({ path: `/api/internal/jobs/${encodeURIComponent(jobId)}/advance`, signed: jobId, fields: { jobId } }));
  },
};

export function scheduleJobContinuation(jobId: string): void {
  httpJobContinuation.schedule(jobId);
}

/**
 * Passo successivo di un lavoro di articolo (T-4101): come scheduleJobContinuation, verso
 * /api/internal/article-runs/{id}/advance con la firma di articleRunStepId; se la consegna fallisce il lavoro resta
 * fermo finché il cron reap-jobs non lo riprende.
 */
export function scheduleArticleRunContinuation(runId: string): void {
  after(() =>
    postContinuation({ path: `/api/internal/article-runs/${encodeURIComponent(runId)}/advance`, signed: articleRunStepId(runId), fields: { runId } })
  );
}
