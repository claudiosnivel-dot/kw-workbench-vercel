import { after } from "next/server";
import { getInternalBaseUrl, getProtectionBypassSecret } from "@/lib/env";
import { JOB_SIGNATURE_TTL_MS, signJobStep } from "@/lib/modules/jobs/job-signature";
import { logger } from "@/lib/observability/logger";

/** Pianificazione del passo successivo di un job, eseguito in un'altra invocazione (T-1203, D-10). */
export interface JobContinuation {
  schedule(jobId: string): void;
}

// La rotta interna risponde 202 subito: l'attesa riguarda solo la consegna della richiesta.
const CONTINUATION_TIMEOUT_MS = 10_000;

async function postContinuation(jobId: string): Promise<void> {
  const base = getInternalBaseUrl();
  if (!base) {
    logger.error("job_continuation_unconfigured", { jobId });
    return;
  }

  // Mai firma, bypass o header nei log (CWE-532): solo jobId ed esito.
  try {
    const expiresAt = Date.now() + JOB_SIGNATURE_TTL_MS;
    const headers: Record<string, string> = {
      "x-job-expires": String(expiresAt),
      "x-job-signature": signJobStep(jobId, expiresAt),
    };
    const bypass = getProtectionBypassSecret();
    if (bypass) {
      headers["x-vercel-protection-bypass"] = bypass;
    }

    const response = await fetch(`${base}/api/internal/jobs/${encodeURIComponent(jobId)}/advance`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(CONTINUATION_TIMEOUT_MS),
    });
    if (response.status !== 202) {
      logger.error("job_continuation_rejected", { jobId, status: response.status });
    }
  } catch (error) {
    logger.error("job_continuation_failed", { jobId, error });
  }
}

/**
 * Implementazione di produzione: registra con after() una POST firmata verso /api/internal/jobs/{id}/advance della
 * stessa deployment (VERCEL_URL) o di APP_PUBLIC_URL, con x-vercel-protection-bypass se Vercel lo fornisce. Se la
 * consegna fallisce il job resta fermo finché il reaper non lo riprende (polling di stato o cron).
 */
const httpJobContinuation: JobContinuation = {
  schedule(jobId) {
    after(() => postContinuation(jobId));
  },
};

export function scheduleJobContinuation(jobId: string): void {
  httpJobContinuation.schedule(jobId);
}
