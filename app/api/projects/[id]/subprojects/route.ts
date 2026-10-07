import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { findOwnedProjectOr404 } from "@/lib/modules/project-access";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseSubprojectCreate } from "@/lib/modules/project-settings";
import { guardSectionName } from "@/lib/modules/sections";
import { prisma } from "@/lib/prisma";

export const POST = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const project = await findOwnedProjectOr404(user.id, id, { id: true, default_subproject_id: true });

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

