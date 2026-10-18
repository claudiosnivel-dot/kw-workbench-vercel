import { NextResponse } from "next/server";
import { refreshModelCatalog } from "@/lib/ai/catalog";
import { withApiErrors } from "@/lib/http/errors";
import { requireCronSecret } from "@/lib/modules/jobs/cron-auth";

export const runtime = "nodejs";

/**
 * Cron notturno del catalogo dei modelli gratuiti di OpenRouter (T-3803, vercel.json alle 04:30 UTC), autorizzato come
 * reap-jobs con CRON_SECRET (401 altrimenti). Una lettura non riuscita del catalogo risponde comunque 200 con refreshed
 * false e lascia il catalogo salvato com'era.
 */
export const GET = withApiErrors(async (request: Request) => {
  requireCronSecret(request);
  const { refreshed, catalog } = await refreshModelCatalog();
  return NextResponse.json({ refreshed, checkedAt: catalog?.checkedAt ?? null, freeModels: catalog?.free.length ?? 0 });
});
