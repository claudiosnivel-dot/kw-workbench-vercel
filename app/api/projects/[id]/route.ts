import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { parseProjectDefaultsPayload } from "@/lib/modules/project-settings";
import { invalidSettingsResponse } from "@/lib/modules/project-settings-response";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const GET = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    include: {
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        include: {
          _count: {
            select: {
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
      },
      _count: {
        select: {
          subprojects: true,
          keyword_candidates: true,
          seeds: true,
          jobs: true,
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  return NextResponse.json({ data: project });
});

export const PATCH = withApiErrors(async (request: Request, context: RouteContext) => {
  try {
    const user = await requireAuthenticatedUserFromRequest(request);
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;

    // Il provider salvato serve a parseProjectDefaultsPayload: GOOGLE_KEYWORD_PLANNER resta solo se c'era già.
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

    const input = parseProjectDefaultsPayload(payload, project.metrics_provider);
    const autocompleteProvider = user.isRootAdmin ? input.autocomplete_provider : "GOOGLE_DIRECT";

    const updated = await prisma.project.update({
      where: { id },
      data: {
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

    return NextResponse.json({ data: updated });
  } catch (error) {
    const invalid = invalidSettingsResponse(error);
    if (invalid) {
      return invalid;
    }
    throw error;
  }
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
