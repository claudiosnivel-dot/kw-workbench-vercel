import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { assertOwnedScope } from "@/lib/modules/project-access";
import { recordOnboardingExport } from "@/lib/onboarding/export-completion";
import { EXPORT_SCOPES } from "@/lib/modules/export-types";
import type { ExportScope } from "@/lib/modules/export-types";
import {
  exportProjectToGoogleSheets,
  GoogleReauthRequiredError,
  GoogleSheetsExportError,
} from "@/lib/modules/google-sheets-export";
import { logger } from "@/lib/observability/logger";
import { parseResultsFilters } from "@/lib/modules/results-filters";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_SCOPES = new Set<ExportScope>(EXPORT_SCOPES);
const INTERNAL_EXPORT_ERROR = "Errore interno durante l'export su Google Sheets";

type ExportGoogleSheetsPayload = {
  fileName?: unknown;
  scope?: unknown;
  subprojectId?: unknown;
  filters?: Record<string, string | string[] | undefined>;
};

function parseBodyFilters(input: unknown): Record<string, string | string[] | undefined> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const source = input as Record<string, unknown>;
  const out: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      out[key] = value.map((item) => String(item));
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    out[key] = String(value);
  }

  return out;
}

export const POST = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  let payload: ExportGoogleSheetsPayload;
  try {
    payload = (await request.json()) as ExportGoogleSheetsPayload;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Body JSON non valido");
  }

  const fileName = String(payload.fileName ?? "").trim();
  const scope = String(payload.scope ?? "non-excluded") as ExportScope;
  const rawSubprojectId = String(payload.subprojectId ?? "").trim();
  const subprojectId = rawSubprojectId || null;

  if (!fileName) {
    return errorResponse(400, "SHEETS_FILE_NAME_REQUIRED", "Nome file obbligatorio");
  }

  if (!VALID_SCOPES.has(scope)) {
    return errorResponse(400, "EXPORT_SCOPE_INVALID", "Scope non valido");
  }

  await assertOwnedScope(user.id, id, subprojectId);

  const filters = parseResultsFilters(parseBodyFilters(payload.filters));

  let output: Awaited<ReturnType<typeof exportProjectToGoogleSheets>>;
  try {
    output = await exportProjectToGoogleSheets({
      userId: user.id,
      projectId: id,
      fileName,
      scope,
      subprojectId,
      filters,
    });
  } catch (error) {
    // GoogleSheetsExportError e GoogleReauthRequiredError (409, T-906) portano status e messaggio pubblici;
    // ogni altra eccezione resta nei log (CWE-209).
    if (error instanceof GoogleSheetsExportError || error instanceof GoogleReauthRequiredError) {
      throw error;
    }
    logger.error("google_sheets_export_failed", { projectId: id, subprojectId, error });
    throw new AppError(500, "INTERNAL_ERROR", INTERNAL_EXPORT_ERROR);
  }

  // Best-effort come l'export su file: l'onboarding non fa fallire un export già scritto (T-1003).
  await recordOnboardingExport(user.id, id, async () => output.exportedRows);

  return NextResponse.json({ data: output });
});
