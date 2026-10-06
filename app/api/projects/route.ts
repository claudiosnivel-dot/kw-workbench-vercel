import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { parseProjectCreate } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

export const GET = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);

  const projects = await prisma.project.findMany({
    where: { owner_user_id: user.id },
    orderBy: { created_at: "desc" },
    include: {
      _count: {
        select: {
          subprojects: true,
          seeds: true,
          keyword_candidates: true,
          jobs: true,
        },
      },
      jobs: {
        orderBy: { created_at: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({ data: projects });
});

export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);

  const payload: unknown = await request.json();
  const input = parseProjectCreate(payload, user);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.project.create({
      data: { owner_user_id: user.id, ...input.data },
    });

    let initialSubprojectId: string | null = null;

    if (input.createInitialSection) {
      const initialSubproject = await tx.subproject.create({
        data: {
          project_id: created.id,
          name: input.initialSubprojectName,
          position: 0,
        },
      });

      initialSubprojectId = initialSubproject.id;

      await tx.project.update({
        where: { id: created.id },
        data: { default_subproject_id: initialSubproject.id },
      });

      if (input.seeds.length > 0) {
        await tx.seed.createMany({
          data: input.seeds.map((keyword) => ({
            project_id: created.id,
            subproject_id: initialSubproject.id,
            keyword,
          })),
        });
      }
    }

    return {
      project: created,
      initial_subproject_id: initialSubprojectId,
    };
  });

  return NextResponse.json({ data: result }, { status: 201 });
});

