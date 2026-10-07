import { requireVerifiedEmail } from "@/lib/auth/verified-email";
import { type SectionParams, withUserRoute } from "@/lib/http/user-route";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { startedJobResponse } from "@/lib/modules/jobs/run-response";
import { requireSectionAccess } from "@/lib/authz/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withUserRoute(async (request: Request, user, { id, subprojectId }: SectionParams) => {
  // Email non verificata: 403 EMAIL_NOT_VERIFIED prima di qualunque lettura (T-1403).
  requireVerifiedEmail(user);
  const subproject = await requireSectionAccess(user, id, subprojectId, "extraction.run", { id: true, project_id: true });

  const { job, created } = await enqueueExtractionJob(subproject.project_id, subproject.id);
  return startedJobResponse(job, created, subproject.id);
});

