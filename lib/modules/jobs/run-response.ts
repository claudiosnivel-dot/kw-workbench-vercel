import type { Job } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";

/**
 * Risposta delle rotte run (T-1204): job nuovo -> 202 con l'id, header Location verso lo stato e primo passo
 * pianificato in background, senza eseguire la pipeline nella richiesta; job già attivo sulla sezione -> 409
 * JOB_ALREADY_ACTIVE con il suo jobId (CWE-770).
 */
export function startedJobResponse(job: Job, created: boolean, subprojectId: string): NextResponse {
  if (!created) {
    throw new AppError(409, JOB_ERROR_CODES.alreadyActive, "Un'estrazione è già in corso per questa sezione", {
      jobId: job.id,
    });
  }

  scheduleJobContinuation(job.id);
  return NextResponse.json(
    { data: { jobId: job.id, status: job.status, phase: job.phase }, meta: { subprojectId } },
    { status: 202, headers: { Location: `/api/jobs/${job.id}` } }
  );
}
