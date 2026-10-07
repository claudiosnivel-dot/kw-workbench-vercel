import { NextRequest, NextResponse } from "next/server";
import { requireProjectScope } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { applyBulkAction, parseBulkActionPayload } from "@/lib/modules/results-bulk";

export const PATCH = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const payload = parseBulkActionPayload(await request.json());
  // Revisione dei risultati: modifica del progetto per MEMBER e superiori (D-08).
  const project = await requireProjectScope(user, id, payload.subprojectId || null, "project.update");

  const updated = await applyBulkAction(project, payload);

  return NextResponse.json({ success: true, updated });
});

