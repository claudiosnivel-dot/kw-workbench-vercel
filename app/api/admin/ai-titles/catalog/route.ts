import { NextResponse } from "next/server";
import { refreshModelCatalogIfStale } from "@/lib/ai/catalog";
import { getAiTitlesView } from "@/lib/ai/settings";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Catalogo dei modelli all'apertura della card «Titoli con l'AI» (T-3803): solo il root admin (admin non root e
 * abbonati 403, anonimi 401). Rilegge il catalogo di OpenRouter se non è mai stato letto o ha più di un'ora, poi
 * restituisce le impostazioni come GET /api/admin/ai-titles; una lettura non riuscita lascia il catalogo salvato.
 */
export const POST = withApiErrors(async (request: Request) => {
  await requireRootAdminUserFromRequest(request);
  await refreshModelCatalogIfStale();
  return NextResponse.json({ data: await getAiTitlesView() }, { headers: { "Cache-Control": "no-store" } });
});
