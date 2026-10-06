import { getIntEnv } from "@/lib/env";
import { advanceJob, type ExtractionSummary } from "@/lib/modules/jobs/advance-job";
import { enqueueExtractionJob } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";

/**
 * Estrazione della sezione eseguita fino alla fine (T-1202): ottiene il job con enqueueExtractionJob (quello attivo,
 * se c'è già) e chiama advanceJob in ciclo fino a more=false. La usano il golden master di T-106 e i test; le rotte
 * avviano il job in background (T-1204). Un job finito failed rilancia l'errore che l'ha causato.
 */
export async function runExtractionPipeline(subprojectId: string): Promise<ExtractionSummary> {
  const subproject = await prisma.subproject.findUnique({ where: { id: subprojectId }, select: { project_id: true } });
  if (!subproject) {
    throw new Error(`Sottoprogetto ${subprojectId} non trovato`);
  }

  const { job } = await enqueueExtractionJob(subproject.project_id, subprojectId);
  for (;;) {
    const step = await advanceJob(job.id, Date.now() + getIntEnv("JOB_STEP_BUDGET_MS"));
    if (step.error) {
      throw step.error;
    }
    if (!step.more) {
      break;
    }
  }

  const finished = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  if (finished.status !== "completed") {
    throw new Error(finished.error_message ?? `Estrazione terminata con stato ${finished.status}`);
  }
  return finished.result as ExtractionSummary;
}
