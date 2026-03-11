import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { parseProjectPayload } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { created_at: "desc" },
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

  return NextResponse.json({ data: projects });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Record<string, unknown>;
  const input = parseProjectPayload(payload);

  const project = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.project.create({
      data: {
        name: input.name,
        language_code: input.language_code,
        country_code: input.country_code,
        autocomplete_provider: input.autocomplete_provider,
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

    if (input.seeds.length > 0) {
      await tx.seed.createMany({
        data: input.seeds.map((keyword) => ({
          project_id: created.id,
          keyword,
        })),
      });
    }

    return created;
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
