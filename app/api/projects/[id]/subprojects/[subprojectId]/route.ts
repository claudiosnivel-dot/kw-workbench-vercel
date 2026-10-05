import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { parseSubprojectPayload } from "@/lib/modules/project-settings";
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
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  const payload = (await request.json()) as Record<string, unknown>;
  const parsed = parseSubprojectPayload(payload);

  const updated = await guardSectionName(() => prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.subproject.update({
      where: { id: subprojectId, project_id: id },
      data: {
        name: parsed.name,
        description: parsed.description,
        language_code_override: parsed.language_code_override,
        country_code_override: parsed.country_code_override,
        autocomplete_provider_override: user.isRootAdmin ? parsed.autocomplete_provider_override : null,
        metrics_provider_override: parsed.metrics_provider_override,
        min_volume_override: parsed.min_volume_override,
        exclude_brands_override: parsed.exclude_brands_override,
        expand_alpha_override: parsed.expand_alpha_override,
        expand_numeric_override: parsed.expand_numeric_override,
        expand_patterns_override: parsed.expand_patterns_override,
        auto_classification_override: parsed.auto_classification_override,
        scoring_profile_override: parsed.scoring_profile_override,
      },
    });

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
