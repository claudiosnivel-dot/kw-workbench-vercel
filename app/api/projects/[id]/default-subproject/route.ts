import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const PATCH = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const payload = (await request.json()) as { subprojectId?: string };
  const subprojectId = String(payload.subprojectId ?? "").trim();

  if (!subprojectId) {
    return NextResponse.json({ error: "Sezione predefinita mancante" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id, owner_user_id: user.id },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  const subproject = await prisma.subproject.findFirst({
    where: { id: subprojectId, project_id: id },
    select: { id: true },
  });

  if (!subproject) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: { default_subproject_id: subprojectId },
    select: {
      id: true,
      default_subproject_id: true,
    },
  });

  return NextResponse.json({ data: updated });
});

