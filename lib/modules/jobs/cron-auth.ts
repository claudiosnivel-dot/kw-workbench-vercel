import { getCronSecret } from "@/lib/env";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { safeEqualText } from "@/lib/modules/jobs/job-signature";

/**
 * Autorizzazione dei cron di Vercel (T-1203, T-3803): Vercel invia CRON_SECRET come Authorization Bearer. Senza
 * CRON_SECRET configurata o con un valore diverso → 401, con un confronto a tempo costante.
 */
export function requireCronSecret(request: Request): void {
  const secret = getCronSecret();
  if (!secret || !safeEqualText(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    throw new AppError(401, JOB_ERROR_CODES.cronUnauthorized, "Non autorizzato");
  }
}
