import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { expectOneRow, requireSectionAccess } from "@/lib/authz/workspace";
import { type SectionParams, withUserRoute } from "@/lib/http/user-route";
import { SectionNotFoundError } from "@/lib/modules/project-access";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseSubprojectPatch } from "@/lib/modules/project-settings";
import { deleteSection, guardSectionName } from "@/lib/modules/sections";
import { prisma } from "@/lib/prisma";

export const PATCH = withUserRoute(async (request: Request, user, { id, subprojectId }: SectionParams) => {
  const existing = await requireSectionAccess(user, id, subprojectId, "section.write", { id: true, metrics_provider_override: true });
  const { project } = existing;

  // Aggiornamento parziale (T-809): seeds assente lascia le seed, seeds vuoto le cancella.
  const parsed = parseSubprojectPatch(await request.json(), user, existing);

  const updated = await guardSectionName(() => prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Perimetro del workspace nel where (T-1502): una membership revocata nel frattempo non porta a una scrittura.
    const { count } = await tx.subproject.updateMany({
      where: { id: subprojectId, project_id: id, project: project.perimeter },
      data: parsed.data,
    });
    expectOneRow(count, () => new SectionNotFoundError());

    if (parsed.seeds !== undefined) {
      await tx.seed.deleteMany({
        where: {
          project_id: id,
          subproject_id: subprojectId,
          project: project.perimeter,
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

    await touchProjectActivity(tx, project);
    return tx.subproject.findUniqueOrThrow({ where: { id: subprojectId } });
  }));

  return NextResponse.json({ data: updated });
});

export const DELETE = withUserRoute(async (request: Request, user, { id, subprojectId }: SectionParams) => {
  const { project } = await requireSectionAccess(user, id, subprojectId, "section.write", { id: true });

  await deleteSection(project, subprojectId);

  return NextResponse.json({ success: true });
});
