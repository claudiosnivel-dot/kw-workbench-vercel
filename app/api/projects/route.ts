import { Prisma } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { parseProjectPayload } from "@/lib/modules/project-settings";
import { invalidSettingsResponse } from "@/lib/modules/project-settings-response";
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

  const payload = (await request.json()) as Record<string, unknown>;
  let input: ReturnType<typeof parseProjectPayload>;
  try {
    input = parseProjectPayload(payload);
  } catch (error) {
    const invalid = invalidSettingsResponse(error);
    if (!invalid) {
      throw error;
    }
    return invalid;
  }
  const createInitialSection = payload.createInitialSection !== false;
  const autocompleteProvider = user.isRootAdmin ? input.autocomplete_provider : "GOOGLE_DIRECT";

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.project.create({
      data: {
        owner_user_id: user.id,
        name: input.name,
        language_code: input.language_code,
        country_code: input.country_code,
        autocomplete_provider: autocompleteProvider,
        metrics_provider: input.metrics_provider,
        min_volume: input.min_volume,
        exclude_brands: input.exclude_brands,
        expand_alpha: input.expand_alpha,
        expand_numeric: input.expand_numeric,
        expand_patterns: input.expand_patterns,
        auto_classification: input.auto_classification,
        scoring_profile: input.scoring_profile,
      },
    });

    let initialSubprojectId: string | null = null;

    if (createInitialSection) {
      const initialSubproject = await tx.subproject.create({
        data: {
          project_id: created.id,
          name: input.initial_subproject_name,
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

