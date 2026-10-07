import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { SectionNotFoundError } from "@/lib/modules/project-access";
import { moveSection } from "@/lib/modules/sections";

type ReorderPayload = {
  subprojectId?: string;
  direction?: "up" | "down";
};

export const PATCH = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const payload = (await request.json()) as ReorderPayload;
  const subprojectId = String(payload.subprojectId ?? "").trim();
  const direction = payload.direction;

  if (!subprojectId || (direction !== "up" && direction !== "down")) {
    return errorResponse(400, "VALIDATION_ERROR", "Dati riordino non validi");
  }

  const project = await requireProjectAccess(user, id, "section.write", {});

  const outcome = await moveSection(project, subprojectId, direction);
  if (outcome === "not-found") {
    throw new SectionNotFoundError();
  }

  return NextResponse.json({ success: true });
});
