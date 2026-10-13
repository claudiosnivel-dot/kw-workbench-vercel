import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { routeLocale } from "@/lib/i18n/route-locale";
import {
  CSV_DIALECT_DEFAULT,
  exportFileInfo,
  isCsvDialect,
  streamExport,
} from "@/lib/modules/export";
import { EXPORT_FORMATS, EXPORT_SCOPES } from "@/lib/modules/export-types";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";
import { requireProjectScope } from "@/lib/authz/workspace";
import { parseResultsFilters } from "@/lib/modules/results-filters";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_FORMATS = new Set<ExportFormat>(EXPORT_FORMATS);
const VALID_SCOPES = new Set<ExportScope>(EXPORT_SCOPES);

export const GET = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const format = (request.nextUrl.searchParams.get("format") ?? "csv") as ExportFormat;
  const scope = (request.nextUrl.searchParams.get("scope") ?? "kept") as ExportScope;
  const csvDialect = request.nextUrl.searchParams.get("csvDialect") ?? CSV_DIALECT_DEFAULT;
  const rawSubprojectId = request.nextUrl.searchParams.get("subprojectId");
  const subprojectId = rawSubprojectId ? rawSubprojectId.trim() : "";

  if (!VALID_FORMATS.has(format)) {
    return errorResponse(400, "EXPORT_FORMAT_INVALID", "Formato non valido");
  }

  // Solo kept, all e filtered (T-2402): uno scope precedente (approved, selected, review, non-excluded) è un 400.
  if (!VALID_SCOPES.has(scope)) {
    return errorResponse(400, "VALIDATION_ERROR", "Scope non valido: usa kept, all o filtered");
  }

  if (!isCsvDialect(csvDialect)) {
    return errorResponse(400, "EXPORT_DIALECT_INVALID", "Dialetto CSV non valido: usa excel-it o rfc4180");
  }

  await requireProjectScope(user, id, subprojectId || null, "export.run");

  const filters = parseResultsFilters(request.nextUrl.searchParams);

  // Autenticazione, progetto e sezione sono verificati sopra: solo ora si apre lo stream (T-805). CSV e XLSX nella
  // lingua della richiesta (T-2103).
  const locale = routeLocale(request, user);
  const params = { projectId: id, subprojectId: subprojectId || null, format, scope, filters, csvDialect, locale };
  const { contentType, filename } = exportFileInfo(params);
  const stream = streamExport(params);

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
