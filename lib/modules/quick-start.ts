import type { AuthUser } from "@/lib/auth/credentials";
import { requireVerifiedEmail } from "@/lib/auth/verified-email";
import type { WorkspaceSummary } from "@/lib/authz/workspace";
import { canPerform } from "@/lib/authz/permissions";
import { assertWithinLimit, countLimitedProjects, loadPlanGuard } from "@/lib/billing/enforce";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { startExtractionJob } from "@/lib/modules/jobs/job-runner";
import { parseProjectCreate, type QuickStartInput, quickStartName } from "@/lib/modules/project-settings";
import type { Targeting } from "@/lib/modules/targeting";
import { prisma } from "@/lib/prisma";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";

/** Progetto e primo argomento creati dall'avvio rapido. */
export type QuickStartCreation = { projectId: string; topicId: string };

/** Esito della ricerca: avviata, oppure il code che l'ha impedita (progetto e argomento restano creati). */
export type QuickStartExtraction = { jobId: string | null; extraction: string };

// Code degli errori che impediscono l'avvio senza annullare la creazione (T-2301): email da verificare, limiti del
// piano, rate limit e quota degli avvii (T-1403, T-1605, T-1701, T-1703).
const EXTRACTION_BLOCKERS = new Set(["EMAIL_NOT_VERIFIED", "PLAN_LIMIT", "RATE_LIMITED", "QUOTA_EXCEEDED"]);

/**
 * Crea in una transazione il progetto nel workspace già autorizzato (project.create), il primo argomento (position 0,
 * argomento predefinito del progetto) e la seed uguale al topic (T-2301). Lingua e paese sono quelli del corpo, se
 * presenti, altrimenti targeting. Limiti del piano come la creazione normale (T-1605); il progetto creato in un
 * workspace ancora senza progetti è created_via_onboarding e resta fuori da maxProjects (T-2004, uno per workspace).
 */
export async function createQuickStartProject(
  user: Pick<AuthUser, "id" | "isRootAdmin">,
  workspaceId: string,
  input: QuickStartInput,
  targeting: Targeting
): Promise<QuickStartCreation> {
  const name = quickStartName(input.topic);
  const { data } = parseProjectCreate(
    {
      name,
      language_code: input.languageCode ?? targeting.languageCode,
      country_code: input.countryCode ?? targeting.countryCode,
      createInitialSection: false,
    },
    user
  );
  const plan = await loadPlanGuard(workspaceId);

  return prisma.$transaction(async (tx) => {
    // Sotto il lock del workspace due avvii concorrenti non creano due progetti fuori dal limite.
    await lockWorkspaceRow(tx, workspaceId);
    const firstProject = (await tx.project.count({ where: { workspace_id: workspaceId } })) === 0;
    if (!firstProject) {
      await assertWithinLimit(tx, plan, "maxProjects", async () => (await countLimitedProjects(tx, workspaceId)) + 1);
    }
    await assertWithinLimit(tx, plan, "maxSectionsPerProject", () => 1);
    await assertWithinLimit(tx, plan, "maxSeedsPerSection", () => 1);

    const project = await tx.project.create({
      data: { workspace_id: workspaceId, created_by_user_id: user.id, created_via_onboarding: firstProject, ...data },
      select: { id: true },
    });
    const topic = await tx.subproject.create({ data: { project_id: project.id, name, position: 0 }, select: { id: true } });
    await tx.project.updateMany({
      where: { id: project.id, workspace_id: workspaceId },
      data: { default_subproject_id: topic.id },
    });
    await tx.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: input.topic } });
    return { projectId: project.id, topicId: topic.id };
  });
}

/**
 * Avvia la ricerca del primo argomento come la rotta run della sezione (T-1204): permesso extraction.run nel workspace,
 * email verificata, poi startExtractionJob e il primo passo in background. Un blocco noto (permesso, email, piano, rate
 * limit, quota, job già attivo nel workspace) diventa il code dell'esito invece di un errore: progetto e argomento
 * restano.
 */
export async function startQuickStartExtraction(
  user: AuthUser,
  creation: QuickStartCreation,
  workspace: Pick<WorkspaceSummary, "id" | "role">
): Promise<QuickStartExtraction> {
  if (!canPerform(workspace.role, "extraction.run")) {
    return { jobId: null, extraction: "FORBIDDEN" };
  }
  try {
    requireVerifiedEmail(user);
    const { job, created } = await startExtractionJob(creation.projectId, creation.topicId, workspace.id, user);
    if (!created) {
      return { jobId: null, extraction: JOB_ERROR_CODES.alreadyActive };
    }
    scheduleJobContinuation(job.id);
    return { jobId: job.id, extraction: "started" };
  } catch (error) {
    if (error instanceof AppError && EXTRACTION_BLOCKERS.has(error.code)) {
      return { jobId: null, extraction: error.code };
    }
    throw error;
  }
}
