import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { parseSubprojectPayload } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
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

    const subprojects = await prisma.subproject.findMany({
      where: { project_id: id },
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
    });

    return NextResponse.json({ data: subprojects });
  } catch (error) {
    console.error("GET /api/projects/[id]/subprojects failed", error);
    return NextResponse.json({ error: "Errore interno durante il caricamento delle sezioni" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
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

    const payload = (await request.json()) as Record<string, unknown>;
    const parsed = parseSubprojectPayload(payload);

    const subproject = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const positionCount = await tx.subproject.count({ where: { project_id: id } });

      const created = await tx.subproject.create({
        data: {
          project_id: id,
          name: parsed.name,
          description: parsed.description,
          position: positionCount,
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

      return created;
    });

    return NextResponse.json({ data: subproject }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects/[id]/subprojects failed", error);
    return NextResponse.json({ error: "Errore interno durante la creazione della sezione" }, { status: 500 });
  }
}

