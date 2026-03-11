import { NextResponse } from "next/server";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  const job = await enqueueExtractionJob(project.id);
  const completed = await runJobById(job.id);

  return NextResponse.json({ data: completed });
}