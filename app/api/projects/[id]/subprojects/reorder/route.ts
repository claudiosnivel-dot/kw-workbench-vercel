import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { moveSection } from "@/lib/modules/sections";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ReorderPayload = {
  subprojectId?: string;
  direction?: "up" | "down";
};

export const PATCH = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const payload = (await request.json()) as ReorderPayload;
  const subprojectId = String(payload.subprojectId ?? "").trim();
  const direction = payload.direction;

  if (!subprojectId || (direction !== "up" && direction !== "down")) {
    return NextResponse.json({ error: "Dati riordino non validi", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id, owner_user_id: user.id },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato", code: "PROJECT_NOT_FOUND" }, { status: 404 });
  }

  const outcome = await moveSection(id, subprojectId, direction);
  if (outcome === "not-found") {
    return NextResponse.json({ error: "Sezione non trovata", code: "SECTION_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
