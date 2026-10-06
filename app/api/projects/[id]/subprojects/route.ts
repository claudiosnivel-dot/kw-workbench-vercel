import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseSubprojectCreate } from "@/lib/modules/project-settings";
import { guardSectionName } from "@/lib/modules/sections";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const POST = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    select: { id: true, default_subproject_id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  const parsed = parseSubprojectCreate(await request.json(), user);

  const subproject = await guardSectionName(() => prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const positionCount = await tx.subproject.count({ where: { project_id: id } });

    const created = await tx.subproject.create({
      data: { project_id: id, position: positionCount, ...parsed.data },
    });

    if (!project.default_subproject_id) {
      await tx.project.update({
        where: { id },
        data: { default_subproject_id: created.id },
      });
    }

    if (parsed.seeds.length > 0) {
      await tx.seed.createMany({
        data: parsed.seeds.map((keyword) => ({
          project_id: id,
          subproject_id: created.id,
          keyword,
        })),
      });
    }

    await touchProjectActivity(tx, id);
    return created;
  }));

  return NextResponse.json({ data: subproject }, { status: 201 });
});

