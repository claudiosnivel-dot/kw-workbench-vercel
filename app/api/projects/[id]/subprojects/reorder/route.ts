import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
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
    return NextResponse.json({ error: "Dati riordino non validi" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id, owner_user_id: user.id },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  const ordered = await prisma.subproject.findMany({
    where: { project_id: id },
    orderBy: [{ position: "asc" }, { created_at: "asc" }],
    select: { id: true },
  });

  const currentIndex = ordered.findIndex((item) => item.id === subprojectId);
  if (currentIndex < 0) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= ordered.length) {
    return NextResponse.json({ success: true });
  }

  const reordered = [...ordered];
  const [moved] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, moved);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (let index = 0; index < reordered.length; index += 1) {
      await tx.subproject.update({
        where: { id: reordered[index].id },
        data: { position: index },
      });
    }
  });

  return NextResponse.json({ success: true });
});

