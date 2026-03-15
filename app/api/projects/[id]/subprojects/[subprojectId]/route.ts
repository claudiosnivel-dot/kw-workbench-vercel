import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { parseSubprojectPayload } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string; subprojectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
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
  } catch (error) {
    console.error("GET /api/projects/[id]/subprojects/[subprojectId] failed", error);
    return NextResponse.json({ error: "Errore interno durante il caricamento della sezione" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
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

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.subproject.update({
        where: { id: subprojectId },
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
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/projects/[id]/subprojects/[subprojectId] failed", error);
    return NextResponse.json({ error: "Errore interno durante il salvataggio della sezione" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
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

    const subprojectCount = await prisma.subproject.count({ where: { project_id: id } });
    if (subprojectCount <= 1) {
      return NextResponse.json(
        { error: "Non puoi eliminare l'ultima sezione. Ogni progetto deve avere almeno una sezione." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUnique({
        where: { id },
        select: { default_subproject_id: true },
      });

      await tx.subproject.delete({ where: { id: subprojectId } });

      const remaining = await tx.subproject.findMany({
        where: { project_id: id },
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: { id: true },
      });

      for (let index = 0; index < remaining.length; index += 1) {
        await tx.subproject.update({
          where: { id: remaining[index].id },
          data: { position: index },
        });
      }

      if (project?.default_subproject_id === subprojectId) {
        await tx.project.update({
          where: { id },
          data: { default_subproject_id: remaining[0]?.id ?? null },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id]/subprojects/[subprojectId] failed", error);
    return NextResponse.json({ error: "Errore interno durante l'eliminazione della sezione" }, { status: 500 });
  }
}

