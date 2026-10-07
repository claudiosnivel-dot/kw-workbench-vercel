import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import {
  CSV_DIALECT_DEFAULT,
  countExportRows,
  exportFileInfo,
  isCsvDialect,
  streamExport,
} from "@/lib/modules/export";
import { EXPORT_FORMATS, EXPORT_SCOPES } from "@/lib/modules/export-types";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";
import { assertOwnedScope } from "@/lib/modules/project-access";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { recordOnboardingExport } from "@/lib/onboarding/export-completion";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_FORMATS = new Set<ExportFormat>(EXPORT_FORMATS);
const VALID_SCOPES = new Set<ExportScope>(EXPORT_SCOPES);

export const GET = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const format = (request.nextUrl.searchParams.get("format") ?? "csv") as ExportFormat;
  const scope = (request.nextUrl.searchParams.get("scope") ?? "non-excluded") as ExportScope;
  const csvDialect = request.nextUrl.searchParams.get("csvDialect") ?? CSV_DIALECT_DEFAULT;
  const rawSubprojectId = request.nextUrl.searchParams.get("subprojectId");
  const subprojectId = rawSubprojectId ? rawSubprojectId.trim() : "";

  if (!VALID_FORMATS.has(format)) {
    return errorResponse(400, "EXPORT_FORMAT_INVALID", "Formato non valido");
  }

  if (!VALID_SCOPES.has(scope)) {
    return errorResponse(400, "EXPORT_SCOPE_INVALID", "Scope non valido");
  }

  if (!isCsvDialect(csvDialect)) {
    return errorResponse(400, "EXPORT_DIALECT_INVALID", "Dialetto CSV non valido: usa excel-it o rfc4180");
  }

  await assertOwnedScope(user.id, id, subprojectId || null);

  const filters = parseResultsFilters(request.nextUrl.searchParams);

  // Autenticazione, progetto e sezione sono verificati sopra: solo ora si apre lo stream (T-805).
  const params = { projectId: id, subprojectId: subprojectId || null, format, scope, filters, csvDialect };
  const { contentType, filename } = exportFileInfo(params);
  const stream = streamExport(params);

  // Conta solo un export non vuoto del progetto attivo (T-1003); un errore non fa fallire l'export.
  await recordOnboardingExport(user.id, id, () => countExportRows(params));

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
