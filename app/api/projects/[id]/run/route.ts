import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { startedJobResponse } from "@/lib/modules/jobs/run-response";
import { resolveDefaultSectionId } from "@/lib/modules/results-view";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RunPayload = {
  subprojectId?: string;
};

async function readRunPayload(request: Request): Promise<RunPayload> {
  try {
    const payload = (await request.json()) as RunPayload;
    return payload ?? {};
  } catch {
    return {};
  }
}

export const POST = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const payload = await readRunPayload(request);
  const requestedSubprojectId = String(payload.subprojectId ?? "").trim();

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    include: {
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: { id: true, name: true, position: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  if (project.subprojects.length === 0) {
    return NextResponse.json({ error: "Nessuna sezione disponibile. Crea prima una sezione." }, { status: 400 });
  }

  const targetSubprojectId = requestedSubprojectId || resolveDefaultSectionId(project.subprojects, project.default_subproject_id);
  const targetSubproject = project.subprojects.find((item) => item.id === targetSubprojectId) ?? null;

  if (!targetSubproject) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  const { job, created } = await enqueueExtractionJob(project.id, targetSubproject.id);
  return startedJobResponse(job, created, targetSubproject.id);
});

