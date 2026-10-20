import type { NextRequest } from "next/server";
import { ARTICLE_EXPORT_FORMATS, type ArticleExportFormat, articleExportResponse } from "@/lib/articles/export";
import { errorResponse } from "@/lib/http/errors";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";

export const runtime = "nodejs";

const VALID_FORMATS = new Set<string>(ARTICLE_EXPORT_FORMATS);

/**
 * Export dell'articolo di una pagina del piano (T-4501, T-4502): format html (con i dati strutturati), md o docx, come
 * allegato con il nome dallo slug; un formato sconosciuto è 400 EXPORT_FORMAT_INVALID, un articolo fuori dal progetto
 * del workspace 404.
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const format = request.nextUrl.searchParams.get("format") ?? "html";
  if (!VALID_FORMATS.has(format)) {
    return errorResponse(400, "EXPORT_FORMAT_INVALID", "Formato non valido");
  }
  return articleExportResponse(user, id, strategyId, pageId, format as ArticleExportFormat);
});
