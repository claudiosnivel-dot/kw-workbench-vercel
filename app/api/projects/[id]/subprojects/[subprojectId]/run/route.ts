import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string; subprojectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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
    select: {
      id: true,
      project_id: true,
    },
  });

  if (!subproject) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  const job = await enqueueExtractionJob(subproject.project_id, subproject.id);
  const completed = await runJobById(job.id);

  return NextResponse.json({ data: completed });
}


