import { after, NextResponse } from "next/server";
import { AppError, JOB_ERROR_CODES, withApiErrors } from "@/lib/http/errors";
import { verifyJobStep } from "@/lib/modules/jobs/job-signature";
import { runJobStep } from "@/lib/modules/jobs/job-step";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Passo di un job in background (T-1203): esclusa dal controllo di sessione del proxy, protetta solo dalla firma
 * HMAC di jobId e scadenza. Firma non valida -> 401 senza letture né scritture sul job; altrimenti 202 subito e il
 * passo in after(), entro la maxDuration della rotta.
 */
export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!verifyJobStep(id, request.headers.get("x-job-expires"), request.headers.get("x-job-signature"))) {
    throw new AppError(401, JOB_ERROR_CODES.signatureInvalid, "Firma della continuazione non valida");
  }

  after(() => runJobStep(id));
  return NextResponse.json({ data: { jobId: id } }, { status: 202 });
});
