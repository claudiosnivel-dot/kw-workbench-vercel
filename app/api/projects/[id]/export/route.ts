import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  CSV_DIALECT_DEFAULT,
  countExportRows,
  exportFileInfo,
  isCsvDialect,
  streamExport,
} from "@/lib/modules/export";
import { EXPORT_FORMATS, EXPORT_SCOPES } from "@/lib/modules/export-types";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { recordOnboardingExport } from "@/lib/onboarding/export-completion";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_FORMATS = new Set<ExportFormat>(EXPORT_FORMATS);
const VALID_SCOPES = new Set<ExportScope>(EXPORT_SCOPES);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withApiErrors(async (request: NextRequest, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const format = (request.nextUrl.searchParams.get("format") ?? "csv") as ExportFormat;
  const scope = (request.nextUrl.searchParams.get("scope") ?? "non-excluded") as ExportScope;
  const csvDialect = request.nextUrl.searchParams.get("csvDialect") ?? CSV_DIALECT_DEFAULT;
  const rawSubprojectId = request.nextUrl.searchParams.get("subprojectId");
  const subprojectId = rawSubprojectId ? rawSubprojectId.trim() : "";

  if (!VALID_FORMATS.has(format)) {
    return NextResponse.json({ error: "Formato non valido" }, { status: 400 });
  }

  if (!VALID_SCOPES.has(scope)) {
    return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
  }

  if (!isCsvDialect(csvDialect)) {
    return NextResponse.json({ error: "Dialetto CSV non valido: usa excel-it o rfc4180" }, { status: 400 });
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
