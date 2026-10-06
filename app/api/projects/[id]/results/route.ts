import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { applyBulkAction, parseBulkActionPayload } from "@/lib/modules/results-bulk";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function ensureOwnedSubproject(params: {
  projectId: string;
  subprojectId: string;
  userId: string;
}) {
  return prisma.subproject.findFirst({
    where: {
      id: params.subprojectId,
      project_id: params.projectId,
      project: {
        owner_user_id: params.userId,
      },
    },
    select: { id: true },
  });
}

export const PATCH = withApiErrors(async (request: NextRequest, context: RouteContext) => {
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
    return NextResponse.json({ error: "Progetto non trovato", code: "PROJECT_NOT_FOUND" }, { status: 404 });
  }

  const payload = parseBulkActionPayload(await request.json());

  const scopedSubprojectId = payload.subprojectId || null;
  if (scopedSubprojectId) {
    const subproject = await ensureOwnedSubproject({
      projectId: id,
      subprojectId: scopedSubprojectId,
      userId: user.id,
    });

    if (!subproject) {
      return NextResponse.json({ error: "Sezione non trovata", code: "SECTION_NOT_FOUND" }, { status: 404 });
    }
  }

  const updated = await applyBulkAction(id, payload);

  return NextResponse.json({ success: true, updated });
});

