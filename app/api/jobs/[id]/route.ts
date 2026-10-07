import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/http/errors";
import { jobStatusBody, requireJobAccess } from "@/lib/modules/jobs/job-api";
import { reapStaleJobs } from "@/lib/modules/jobs/reaper";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Stato di un job di un progetto del workspace (T-1204, T-1502: membri con project.read). Il polling è anche il recupero principale dei job bloccati
 * (T-1203): un job fermo oltre la soglia riparte o, al tetto di tentativi, diventa failed.
 */
export const GET = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { job } = await requireJobAccess(request, params, "project.read");

  const { resumed, failed } = await reapStaleJobs({ jobId: job.id });
  const current = resumed + failed > 0 ? await prisma.job.findUniqueOrThrow({ where: { id: job.id } }) : job;

  return NextResponse.json(jobStatusBody(current), { headers: { "Cache-Control": "no-store" } });
});
