import type { Job } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";

/**
 * Risposta delle rotte run: job failed -> 500 con un messaggio fisso, il codice JOB_FAILED e il jobId
 * (il messaggio pubblico di T-706 resta in jobs.error_message); altrimenti 200 con il body indicato.
 */
export function runJobResponse(job: Job | null, body: Record<string, unknown>): NextResponse {
  if (job?.status === "failed") {
    return NextResponse.json({ error: "Estrazione non riuscita", code: "JOB_FAILED", jobId: job.id }, { status: 500 });
  }

  return NextResponse.json(body);
}
