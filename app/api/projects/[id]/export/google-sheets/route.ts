import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { AppError, withApiErrors } from "@/lib/http/errors";
import { markOnboardingExportCompleted } from "@/lib/onboarding/progress";
import { ExportScope } from "@/lib/modules/export";
import {
  exportProjectToGoogleSheets,
  GoogleReauthRequiredError,
  GoogleSheetsExportError,
} from "@/lib/modules/google-sheets-export";
import { logger } from "@/lib/observability/logger";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_SCOPES = new Set<ExportScope>(["approved", "selected", "review", "non-excluded", "filtered"]);
const INTERNAL_EXPORT_ERROR = "Errore interno durante l'export su Google Sheets";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export const POST = withApiErrors(async (request: NextRequest, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  let payload: ExportGoogleSheetsPayload;
  try {
    payload = (await request.json()) as ExportGoogleSheetsPayload;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const fileName = String(payload.fileName ?? "").trim();
  const scope = String(payload.scope ?? "non-excluded") as ExportScope;
  const rawSubprojectId = String(payload.subprojectId ?? "").trim();
  const subprojectId = rawSubprojectId || null;

  if (!fileName) {
    return NextResponse.json({ error: "Nome file obbligatorio" }, { status: 400 });
  }

  if (!VALID_SCOPES.has(scope)) {
    return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  if (subprojectId) {
    const subproject = await prisma.subproject.findFirst({
      where: {
        id: subprojectId,
        project_id: id,
        project: {
          owner_user_id: user.id,
        },
      },
      select: { id: true },
    });

    if (!subproject) {
      return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
    }
  }

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

  // Best-effort come l'export su file (T-805): l'onboarding non fa fallire un export già scritto (T-1003).
  try {
    await markOnboardingExportCompleted(user.id, { projectId: id, exportedRows: output.exportedRows });
  } catch (error) {
    logger.error("onboarding_export_mark_failed", { userId: user.id, projectId: id, error });
  }

  return NextResponse.json({ data: output });
});
