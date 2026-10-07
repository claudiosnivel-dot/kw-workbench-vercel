import { NextRequest, NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { assertOwnedScope } from "@/lib/modules/project-access";
import { applyBulkAction, parseBulkActionPayload } from "@/lib/modules/results-bulk";


export const PATCH = withUserRoute(async (request: NextRequest, user, { id }: ProjectParams) => {
  const payload = parseBulkActionPayload(await request.json());
  await assertOwnedScope(user.id, id, payload.subprojectId || null);

  const updated = await applyBulkAction(id, payload);

  return NextResponse.json({ success: true, updated });
});

