import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  buildPlannerExport,
  PLANNER_CHUNK_DEFAULT,
  plannerPartCsv,
  plannerPartFileName,
} from "@/lib/modules/planner/export-keywords";
import { loadPlannerExportRows } from "@/lib/modules/planner/export-source";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Export per Keyword Planner (T-904): senza `part` il riepilogo {canonicals, parts, skipped}, con `part=N` il
 * blocco N come CSV da scaricare. Progetto e sezione filtrati per proprietario: agli altri 404 (CWE-639).
 */
export const GET = withApiErrors(async (request: NextRequest, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const sectionId = request.nextUrl.searchParams.get("sectionId")?.trim() || null;

  const source = await loadPlannerExportRows({ projectId: id, sectionId, ownerUserId: user.id });
  if ("notFound" in source) {
    const error = source.notFound === "project" ? "Progetto non trovato" : "Sezione non trovata";
    return NextResponse.json({ error }, { status: 404 });
  }

  const plan = buildPlannerExport(source.rows, PLANNER_CHUNK_DEFAULT);
  const rawPart = request.nextUrl.searchParams.get("part");
  if (rawPart === null) {
    return NextResponse.json({ data: { canonicals: plan.canonicals, parts: plan.parts.length, skipped: plan.skipped } });
  }

  const part = /^\d+$/.test(rawPart) ? Number(rawPart) : 0;
  if (part < 1 || part > plan.parts.length) {
    return NextResponse.json({ error: "Blocco non trovato" }, { status: 404 });
  }
  return new NextResponse(plannerPartCsv(plan.parts[part - 1]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${plannerPartFileName(id, sectionId, part)}"`,
    },
  });
});
