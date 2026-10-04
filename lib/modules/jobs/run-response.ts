import type { Job } from "@/lib/generated/prisma/client";
import { NextResponse } from "next/server";

/**
 * Risposta delle rotte run: job failed -> 500 senza error_message grezzo, che può contenere
 * dettagli interni (la sanificazione è T-706); altrimenti 200 con il body indicato.
 */
export function runJobResponse(job: Job | null, body: Record<string, unknown>): NextResponse {
  if (job?.status === "failed") {
    return NextResponse.json({ error: "Estrazione non riuscita", code: "JOB_FAILED", jobId: job.id }, { status: 500 });
  }

  return NextResponse.json(body);
}
