import { NextResponse } from "next/server";
import { reapStaleArticleRuns } from "@/lib/articles/run";
import { withApiErrors } from "@/lib/http/errors";
import { requireCronSecret } from "@/lib/modules/jobs/cron-auth";
import { reapStaleJobs } from "@/lib/modules/jobs/reaper";
import { reapStalePlanRuns } from "@/lib/modules/plan-runs/run";
import { logger } from "@/lib/observability/logger";
import { pruneRateLimitHits } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/**
 * Cron di sicurezza dei job bloccati (T-1203, vercel.json): Vercel invia CRON_SECRET come Authorization Bearer.
 * Senza CRON_SECRET configurata o con un valore diverso -> 401. Il recupero è idempotente: la consegna duplicata
 * del cron non riprende due volte lo stesso job. Riprende anche i lavori degli articoli (T-4101) e di piano (T-6201)
 * fermi, sommati negli stessi conteggi. È anche il cron di manutenzione del rate limit (T-1701): elimina i tentativi
 * usciti dalla finestra più lunga, con il solo conteggio nel log (il corpo della risposta non cambia).
 */
export const GET = withApiErrors(async (request: Request) => {
  requireCronSecret(request);

  const jobs = await reapStaleJobs();
  const articleRuns = await reapStaleArticleRuns();
  const planRuns = await reapStalePlanRuns();
  logger.info("rate_limit_hits_pruned", { count: await pruneRateLimitHits() });
  const totals = [jobs, articleRuns, planRuns];
  return NextResponse.json({
    resumed: totals.reduce((sum, item) => sum + item.resumed, 0),
    failed: totals.reduce((sum, item) => sum + item.failed, 0),
  });
});
