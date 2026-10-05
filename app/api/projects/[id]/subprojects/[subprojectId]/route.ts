import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseSubprojectPatch } from "@/lib/modules/project-settings";
import { deleteSection, guardSectionName } from "@/lib/modules/sections";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string; subprojectId: string }>;
};

export const GET = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id, subprojectId } = await context.params;

  const subproject = await prisma.subproject.findFirst({
    where: {
      id: subprojectId,
      project_id: id,
      project: {
        owner_user_id: user.id,
      },
    },
    include: {
      project: true,
      seeds: { orderBy: { created_at: "asc" } },
      _count: {
        select: {
          keyword_candidates: true,
          jobs: true,
        },
      },
    },
  });

  if (!subproject) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  return NextResponse.json({ data: subproject });
});

export const PATCH = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id, subprojectId } = await context.params;

  const existing = await prisma.subproject.findFirst({
    where: {
      id: subprojectId,
      project_id: id,
      project: {
        owner_user_id: user.id,
      },
    },
    select: { id: true, metrics_provider_override: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  // Aggiornamento parziale (T-809): seeds assente lascia le seed, seeds vuoto le cancella.
  const parsed = parseSubprojectPatch(await request.json(), user, existing);

  const updated = await guardSectionName(() => prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.subproject.update({
      where: { id: subprojectId, project_id: id },
      data: parsed.data,
    });

    if (parsed.seeds !== undefined) {
      await tx.seed.deleteMany({
        where: {
          project_id: id,
          subproject_id: subprojectId,
        },
      });

      if (parsed.seeds.length > 0) {
        await tx.seed.createMany({
          data: parsed.seeds.map((keyword) => ({
            project_id: id,
            subproject_id: subprojectId,
            keyword,
          })),
        });
      }
    }

    await touchProjectActivity(tx, id);
    return result;
  }));

  return NextResponse.json({ data: updated });
});

export const DELETE = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id, subprojectId } = await context.params;

  const existing = await prisma.subproject.findFirst({
    where: {
      id: subprojectId,
      project_id: id,
      project: {
        owner_user_id: user.id,
      },
    },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  await deleteSection(id, subprojectId);

  return NextResponse.json({ success: true });
});
