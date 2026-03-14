import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { parseProjectPayload } from "@/lib/modules/project-settings";
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
      include: {
        seeds: { orderBy: { created_at: "asc" } },
        jobs: { orderBy: { created_at: "desc" }, take: 25 },
        _count: {
          select: {
            keyword_candidates: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
    }

    return NextResponse.json({ data: project });
  } catch (error) {
    console.error("GET /api/projects/[id] failed", error);
    return NextResponse.json({ error: "Errore interno durante il caricamento del progetto" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUserFromRequest(request);
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const input = parseProjectPayload(payload);
    const autocompleteProvider = user.isRootAdmin ? input.autocomplete_provider : "GOOGLE_DIRECT";

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

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.project.update({
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

      await tx.seed.deleteMany({ where: { project_id: id } });

      if (input.seeds.length > 0) {
        await tx.seed.createMany({
          data: input.seeds.map((keyword) => ({
            project_id: id,
            keyword,
          })),
        });
      }

      return result;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/projects/[id] failed", error);
    return NextResponse.json({ error: "Errore interno durante il salvataggio del progetto" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] failed", error);
    return NextResponse.json({ error: "Errore interno durante l'eliminazione del progetto" }, { status: 500 });
  }
}
