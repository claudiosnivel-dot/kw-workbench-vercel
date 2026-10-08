import { requireVerifiedEmail } from "@/lib/auth/verified-email";
import { errorResponse } from "@/lib/http/errors";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { startedJobResponse } from "@/lib/modules/jobs/run-response";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { extractionPlanLimits } from "@/lib/billing/enforce";
import { SectionNotFoundError } from "@/lib/modules/project-access";
import { resolveDefaultSectionId } from "@/lib/modules/results-view";

export const runtime = "nodejs";
export const maxDuration = 300;

type RunPayload = {
  subprojectId?: string;
};

async function readRunPayload(request: Request): Promise<RunPayload> {
  try {
    const payload = (await request.json()) as RunPayload;
    return payload ?? {};
  } catch {
    return {};
  }
}

export const POST = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  // Email non verificata: 403 EMAIL_NOT_VERIFIED prima di qualunque lettura (T-1403).
  requireVerifiedEmail(user);
  const payload = await readRunPayload(request);
  const requestedSubprojectId = String(payload.subprojectId ?? "").trim();

  const project = await requireProjectAccess(user, id, "extraction.run", {
    id: true,
    default_subproject_id: true,
    subprojects: {
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
      select: { id: true, name: true, position: true },
    },
  });

  if (project.subprojects.length === 0) {
    return errorResponse(400, "NO_SECTIONS", "Nessuna sezione disponibile. Crea prima una sezione.");
  }

  const targetSubprojectId = requestedSubprojectId || resolveDefaultSectionId(project.subprojects, project.default_subproject_id);
  const targetSubproject = project.subprojects.find((item) => item.id === targetSubprojectId) ?? null;

  if (!targetSubproject) {
    throw new SectionNotFoundError();
  }

  const { job, created } = await enqueueExtractionJob(
    project.id,
    targetSubproject.id,
    await extractionPlanLimits(project.workspace_id)
  );
  return startedJobResponse(job, created, targetSubproject.id);
});

