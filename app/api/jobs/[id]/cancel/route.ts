import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/http/errors";
import { cancelAuthorizedJob, requireJobAccess } from "@/lib/modules/jobs/job-api";

export const runtime = "nodejs";

/**
 * Annullamento di un job di un progetto del workspace (T-1204, T-1502: membri con extraction.run): pending -> canceled subito (200); running ->
 * richiesta registrata e annullamento al batch successivo (202); già terminato -> 409 JOB_NOT_CANCELABLE.
 */
export const POST = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const authorized = await requireJobAccess(request, params, "extraction.run");
  const { job } = authorized;

  const outcome = await cancelAuthorizedJob(authorized);
  return NextResponse.json(
    { data: { id: job.id, status: outcome, cancelRequested: outcome === "running" } },
    { status: outcome === "canceled" ? 200 : 202 }
  );
});
