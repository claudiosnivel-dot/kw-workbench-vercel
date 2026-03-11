import { NextRequest, NextResponse } from "next/server";
import { ExportFormat, ExportScope, generateExport } from "@/lib/modules/export";
import { parseResultsFilters } from "@/lib/modules/results-filters";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_FORMATS = new Set<ExportFormat>(["csv", "xlsx", "json"]);
const VALID_SCOPES = new Set<ExportScope>(["approved", "selected", "review", "non-excluded", "filtered"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const format = (request.nextUrl.searchParams.get("format") ?? "csv") as ExportFormat;
    const scope = (request.nextUrl.searchParams.get("scope") ?? "non-excluded") as ExportScope;

    if (!VALID_FORMATS.has(format)) {
      return NextResponse.json({ error: "Formato non valido" }, { status: 400 });
    }

    if (!VALID_SCOPES.has(scope)) {
      return NextResponse.json({ error: "Scope non valido" }, { status: 400 });
    }

    const filters = parseResultsFilters(request.nextUrl.searchParams);

    const output = await generateExport({
      projectId: id,
      format,
      scope,
      filters,
    });

    return new NextResponse(output.buffer, {
      status: 200,
      headers: {
        "Content-Type": output.contentType,
        "Content-Disposition": `attachment; filename="${output.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/export failed", error);
    return NextResponse.json({ error: "Errore interno durante la generazione dell'export" }, { status: 500 });
  }
}