import type { Prisma } from "@/lib/generated/prisma/client";
import { getIntEnv } from "@/lib/env";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { ACTIVE_JOB_STATUSES, failJobAfterAttempts } from "@/lib/modules/jobs/job-state";
import { prisma } from "@/lib/prisma";

/** Job bloccati: attivi, senza lease valido e con heartbeat (o creazione, se mai partiti) più vecchio della soglia. */
function staleWhere(now: Date): Prisma.JobWhereInput {
  const staleBefore = new Date(now.getTime() - getIntEnv("JOB_STALE_AFTER_MS"));
  return {
    status: { in: ACTIVE_JOB_STATUSES },
    OR: [{ locked_until: null }, { locked_until: { lt: now } }],
    AND: [{ OR: [{ heartbeat_at: { lt: staleBefore } }, { heartbeat_at: null, created_at: { lt: staleBefore } }] }],
  };
}

/**
 * Recupero idempotente dei job bloccati (T-1203), invocato al polling di stato (con jobId) e dal cron di sicurezza.
 * Ogni ripresa è un updateMany condizionale sulla stessa soglia che conta il tentativo e aggiorna heartbeat_at: una
 * seconda invocazione ravvicinata (consegna duplicata del cron) non trova più il job. Al tetto JOB_MAX_ATTEMPTS il
 * job è failed invece di ripartire.
 */
export async function reapStaleJobs(options: { jobId?: string; limit?: number } = {}): Promise<{ resumed: number; failed: number }> {
  const { jobId, limit = 50 } = options;
  const now = new Date();
  const where = staleWhere(now);
  const maxAttempts = getIntEnv("JOB_MAX_ATTEMPTS");

  const stale = await prisma.job.findMany({
    where: jobId ? { ...where, id: jobId } : where,
    orderBy: { created_at: "asc" },
    take: limit,
    select: { id: true, project_id: true, attempts: true },
  });

  let resumed = 0;
  let failed = 0;
  for (const job of stale) {
    if (job.attempts >= maxAttempts) {
      if (await failJobAfterAttempts(job, job.attempts)) {
        failed += 1;
      }
      continue;
    }

    const claimed = await prisma.job.updateMany({
      where: { ...where, id: job.id },
      data: { attempts: { increment: 1 }, heartbeat_at: now },
    });
    if (claimed.count === 1) {
      resumed += 1;
      scheduleJobContinuation(job.id);
    }
  }

  return { resumed, failed };
}
