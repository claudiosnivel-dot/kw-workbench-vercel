import { getIntEnv } from "@/lib/env";
import { advanceJob } from "@/lib/modules/jobs/advance-job";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { ACTIVE_JOB_STATUSES, failJobAfterAttempts } from "@/lib/modules/jobs/job-state";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/**
 * Eccezione non gestita in un passo (T-1203): una riga di log con jobId e fase (senza payload dei provider né
 * segreti), tentativo contato, lease rilasciato e nuova continuazione; al tetto JOB_MAX_ATTEMPTS il job è failed.
 */
async function recordStepFailure(jobId: string, error: unknown): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, project_id: true, phase: true } });
  logger.error("job_step_failed", { jobId, phase: job?.phase ?? null, error });
  if (!job) {
    return;
  }

  const counted = await prisma.job.updateMany({
    where: { id: jobId, status: { in: ACTIVE_JOB_STATUSES } },
    data: { attempts: { increment: 1 }, locked_until: null },
  });
  if (counted.count === 0) {
    return;
  }

  const { attempts } = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { attempts: true } });
  if (attempts >= getIntEnv("JOB_MAX_ATTEMPTS")) {
    await failJobAfterAttempts(job, attempts);
    return;
  }
  scheduleJobContinuation(jobId);
}

/** Un passo del job in background: advanceJob per JOB_STEP_BUDGET_MS, poi il passo successivo se serve. */
export async function runJobStep(jobId: string): Promise<void> {
  try {
    const step = await advanceJob(jobId, Date.now() + getIntEnv("JOB_STEP_BUDGET_MS"));
    if (step.more) {
      scheduleJobContinuation(jobId);
    }
  } catch (error) {
    await recordStepFailure(jobId, error);
  }
}
