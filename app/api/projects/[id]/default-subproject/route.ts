import { NextResponse } from "next/server";
import { requireProjectScope } from "@/lib/authz/workspace";
import { errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { setDefaultSection } from "@/lib/modules/sections";

export const PATCH = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const payload = (await request.json()) as { subprojectId?: string };
  const subprojectId = String(payload.subprojectId ?? "").trim();

  if (!subprojectId) {
    return errorResponse(400, "VALIDATION_ERROR", "Sezione predefinita mancante");
  }

  const project = await requireProjectScope(user, id, subprojectId, "section.write");

  return NextResponse.json({ data: await setDefaultSection(project, subprojectId) });
});

