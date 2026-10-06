import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/http/errors";
import { cancelOwnedJob, requireOwnedJob } from "@/lib/modules/jobs/job-api";

export const runtime = "nodejs";

/**
 * Annullamento di un job del proprietario del progetto (T-1204): pending -> canceled subito (200); running ->
 * richiesta registrata e annullamento al batch successivo (202); già terminato -> 409 JOB_NOT_CANCELABLE.
 */
export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const job = await requireOwnedJob(request, params);

  const outcome = await cancelOwnedJob(job.id);
  return NextResponse.json(
    { data: { id: job.id, status: outcome, cancelRequested: outcome === "running" } },
    { status: outcome === "canceled" ? 200 : 202 }
  );
});
