import { type ExtractionPlanLimits, extractionPlanLimits } from "@/lib/billing/enforce";
import { isCommercialLive } from "@/lib/billing/launch";
import { reserveRun } from "@/lib/billing/usage";
import { isUniqueViolation } from "@/lib/db/unique-violation";
import type { Job, Prisma } from "@/lib/generated/prisma/client";
import { getIntEnv } from "@/lib/env";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { ACTIVE_JOB_STATUSES, failActiveJob, failureCauseOf, toPublicJobError } from "@/lib/modules/jobs/job-state";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";

// Un job concluso tra la violazione dell'indice e la rilettura libera la sezione: si riprova l'inserimento.
const ENQUEUE_ATTEMPTS = 3;

/** Dati del nuovo job di estrazione pending della sezione, con il payload dell'avvio. */
function extractionJobData(projectId: string, subprojectId: string, payload: Prisma.InputJsonObject) {
  return {
    project_id: projectId,
    subproject_id: subprojectId,
    type: "extraction" as const,
    status: "pending" as const,
    payload: { projectId, subprojectId, ...payload },
  };
}

/**
 * Crea il job di estrazione della sezione (T-1201). L'indice parziale jobs_one_active_per_subproject ammette un solo
 * job pending o running per sezione: se esiste già, restituisce quello con created=false invece di propagare la
 * violazione (nessun controllo check-then-insert, CWE-362). plan sono i limiti del piano letti all'avvio (T-1605):
 * tetto di keyword e metriche con licenza, salvati nel payload; senza, l'estrazione non ha limiti di piano.
 */
export async function enqueueExtractionJob(
  projectId: string,
  subprojectId: string,
  plan?: ExtractionPlanLimits
): Promise<{ job: Job; created: boolean }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const job = await prisma.job.create({ data: extractionJobData(projectId, subprojectId, plan ? { plan } : {}) });
      return { job, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const active = await activeJobOfSection(subprojectId);
      if (active) {
        return { job: active, created: false };
      }
      if (attempt >= ENQUEUE_ATTEMPTS) {
        throw error;
      }
    }
  }
}

/** Job già attivo nel workspace: annulla la transazione dell'avvio, e con lei la quota riservata (T-1703). */
class ActiveJobInWorkspace extends Error {
  constructor(readonly job: Job) {
    super("Un job è già attivo nel workspace");
    this.name = "ActiveJobInWorkspace";
  }
}

/** Job attivo della sezione dopo una violazione dell'indice jobs_one_active_per_subproject, o null. */
function activeJobOfSection(subprojectId: string): Promise<Job | null> {
  return prisma.job.findFirst({ where: { subproject_id: subprojectId, status: { in: ACTIVE_JOB_STATUSES } } });
}

/**
 * Avvio di un'estrazione dalle rotte (T-1204, T-1605, T-1703). Con il lancio commerciale in pausa (D-32) come
 * enqueueExtractionJob, con i limiti del piano nel payload e nessuna quota. Con il lancio attivo: rate limit sugli
 * avvii del workspace (429 RATE_LIMITED, D-27 emendata), poi in una transazione sotto il lock della riga del workspace
 * la riserva dell'avvio (429 QUOTA_EXCEEDED), il controllo di un solo job attivo per workspace (created=false con quel
 * job: la transazione si annulla con la riserva) e la creazione del job con la riserva nel payload. actor è chi avvia:
 * il root admin ha sempre le metriche con licenza (T-2003).
 */
export async function startExtractionJob(
  projectId: string,
  subprojectId: string,
  workspaceId: string,
  actor: { isRootAdmin: boolean }
): Promise<{ job: Job; created: boolean }> {
  const { runsPerDay, ...plan } = await extractionPlanLimits(workspaceId, actor);
  if (!(await isCommercialLive())) {
    return enqueueExtractionJob(projectId, subprojectId, plan);
  }

  await enforceRateLimits([{ key: `run:workspace:${workspaceId}`, rule: rateLimitRules().runStart }]);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockWorkspaceRow(tx, workspaceId);
      const quota = await reserveRun(tx, workspaceId, { runsPerDay, keywordsPerMonth: plan.keywordsPerMonth ?? null }, new Date());
      const active = await tx.job.findFirst({
        where: { status: { in: ACTIVE_JOB_STATUSES }, project: { workspace_id: workspaceId } },
        orderBy: { created_at: "asc" },
      });
      if (active) {
        throw new ActiveJobInWorkspace(active);
      }
      const job = await tx.job.create({ data: extractionJobData(projectId, subprojectId, { plan, quota }) });
      return { job, created: true };
    });
  } catch (error) {
    if (error instanceof ActiveJobInWorkspace) {
      return { job: error.job, created: false };
    }
    const active = isUniqueViolation(error) ? await activeJobOfSection(subprojectId) : null;
    if (active) {
      return { job: active, created: false };
    }
    throw error;
  }
}

/**
 * Esegue il job fino alla fine nel processo corrente con passi di JOB_STEP_BUDGET_MS (test e CLI; le rotte lo
 * avviano in background, T-1204). Un'eccezione di un passo porta subito il job a failed con il messaggio pubblico.
 */
export async function runJobById(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    for (;;) {
      const step = await advanceJob(job.id, Date.now() + getIntEnv("JOB_STEP_BUDGET_MS"));
      if (!step.more) {
        break;
      }
    }
  } catch (error) {
    // Stack completo solo nel log, correlabile con l'evento di Sentry (T-602); nel DB il messaggio pubblico (T-706).
    logger.error("job_failed", { jobId: job.id, projectId: job.project_id, subprojectId: job.subproject_id, error });
    await failActiveJob(job, toPublicJobError(error), failureCauseOf(error));
  }

  return prisma.job.findUnique({ where: { id: job.id } });
}
