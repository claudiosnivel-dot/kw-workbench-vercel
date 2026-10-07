import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import {
  buildPlannerExport,
  PLANNER_CHUNK_DEFAULT,
  plannerPartCsv,
  plannerPartFileName,
} from "@/lib/modules/planner/export-keywords";
import { loadPlannerExportRows } from "@/lib/modules/planner/export-source";
import { ProjectNotFoundError, SectionNotFoundError } from "@/lib/modules/project-access";

export const runtime = "nodejs";

/**
 * Export per Keyword Planner (T-904): senza `part` il riepilogo {canonicals, parts, skipped}, con `part=N` il
 * blocco N come CSV da scaricare. Progetto e sezione filtrati per proprietario: agli altri 404 (CWE-639).
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const sectionId = request.nextUrl.searchParams.get("sectionId")?.trim() || null;

  const source = await loadPlannerExportRows({ projectId: id, sectionId, ownerUserId: user.id });
  if ("notFound" in source) {
    throw source.notFound === "project" ? new ProjectNotFoundError() : new SectionNotFoundError();
  }

  const plan = buildPlannerExport(source.rows, PLANNER_CHUNK_DEFAULT);
  const rawPart = request.nextUrl.searchParams.get("part");
  if (rawPart === null) {
    return NextResponse.json({ data: { canonicals: plan.canonicals, parts: plan.parts.length, skipped: plan.skipped } });
  }

  const part = /^\d+$/.test(rawPart) ? Number(rawPart) : 0;
  if (part < 1 || part > plan.parts.length) {
    return errorResponse(404, "PLANNER_PART_NOT_FOUND", "Blocco non trovato");
  }
  return new NextResponse(plannerPartCsv(plan.parts[part - 1]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${plannerPartFileName(id, sectionId, part)}"`,
    },
  });
});
