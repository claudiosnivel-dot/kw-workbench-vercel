import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { findOwnedJob, jobStatusBody } from "@/lib/modules/jobs/job-api";
import { reapStaleJobs } from "@/lib/modules/jobs/reaper";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Stato di un job del proprietario del progetto (T-1204). Il polling è anche il recupero principale dei job bloccati
 * (T-1203): un job fermo oltre la soglia riparte o, al tetto di tentativi, diventa failed.
 */
export const GET = withApiErrors(async (request: Request, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const job = await findOwnedJob(id, user.id);

  const { resumed, failed } = await reapStaleJobs({ jobId: job.id });
  const current = resumed + failed > 0 ? await prisma.job.findUniqueOrThrow({ where: { id: job.id } }) : job;

  return NextResponse.json(jobStatusBody(current), { headers: { "Cache-Control": "no-store" } });
});
