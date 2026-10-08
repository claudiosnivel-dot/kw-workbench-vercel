import { NextResponse } from "next/server";
import { getCronSecret } from "@/lib/env";
import { AppError, JOB_ERROR_CODES, withApiErrors } from "@/lib/http/errors";
import { safeEqualText } from "@/lib/modules/jobs/job-signature";
import { reapStaleJobs } from "@/lib/modules/jobs/reaper";
import { logger } from "@/lib/observability/logger";
import { pruneRateLimitHits } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/**
 * Cron di sicurezza dei job bloccati (T-1203, vercel.json): Vercel invia CRON_SECRET come Authorization Bearer.
 * Senza CRON_SECRET configurata o con un valore diverso -> 401. Il recupero è idempotente: la consegna duplicata
 * del cron non riprende due volte lo stesso job. È anche il cron di manutenzione del rate limit (T-1701): elimina i
 * tentativi usciti dalla finestra più lunga, con il solo conteggio nel log (il corpo della risposta non cambia).
 */
export const GET = withApiErrors(async (request: Request) => {
  const secret = getCronSecret();
  if (!secret || !safeEqualText(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    throw new AppError(401, JOB_ERROR_CODES.cronUnauthorized, "Non autorizzato");
  }

  const reaped = await reapStaleJobs();
  logger.info("rate_limit_hits_pruned", { count: await pruneRateLimitHits() });
  return NextResponse.json(reaped);
});
