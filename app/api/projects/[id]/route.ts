import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { parseProjectPatch } from "@/lib/modules/project-settings";
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
    const payload: unknown = await request.json();

    // Il provider salvato serve a parseProjectPatch: GOOGLE_KEYWORD_PLANNER e MOCK restano se c'erano già.
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

    // Aggiornamento parziale (T-809): solo i campi inviati, validati da uno schema strict.
    const data = parseProjectPatch(payload, user, project);
    const updated = await prisma.project.update({ where: { id }, data });

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
