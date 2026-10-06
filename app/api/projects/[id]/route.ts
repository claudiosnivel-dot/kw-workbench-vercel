import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseProjectPatch } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const PATCH = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const payload: unknown = await request.json();

  // Il provider salvato serve a parseProjectPatch: MOCK e DATAFORSEO restano se c'erano già.
  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    select: { metrics_provider: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  // Aggiornamento parziale (T-809): solo i campi inviati, validati da uno schema strict.
  const data = parseProjectPatch(payload, user, project);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.project.update({ where: { id }, data });
    await touchProjectActivity(tx, id);
    return result;
  });

  return NextResponse.json({ data: updated });
});

export const DELETE = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
