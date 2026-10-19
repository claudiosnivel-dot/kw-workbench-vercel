import { NextResponse } from "next/server";
import { refreshModelCatalog } from "@/lib/ai/catalog";
import { pruneAiRequests } from "@/lib/ai/requests";
import { withApiErrors } from "@/lib/http/errors";
import { requireCronSecret } from "@/lib/modules/jobs/cron-auth";

export const runtime = "nodejs";

/**
 * Cron notturno del catalogo dei modelli gratuiti di OpenRouter (T-3803, vercel.json alle 04:30 UTC), autorizzato come
 * reap-jobs con CRON_SECRET (401 altrimenti). Prima elimina le righe di ai_requests più vecchie di 30 giorni (T-3901),
 * poi rilegge il catalogo: una lettura non riuscita risponde comunque 200 con refreshed false e lascia il catalogo
 * salvato com'era.
 */
export const GET = withApiErrors(async (request: Request) => {
  requireCronSecret(request);
  const prunedRequests = await pruneAiRequests();
  const { refreshed, catalog } = await refreshModelCatalog();
  return NextResponse.json({ refreshed, checkedAt: catalog?.checkedAt ?? null, freeModels: catalog?.free.length ?? 0, prunedRequests });
});
