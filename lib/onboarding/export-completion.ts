import { logger } from "@/lib/observability/logger";
import { markOnboardingExportCompleted } from "@/lib/onboarding/progress";

/**
 * Avanzamento dell'onboarding dopo un export (T-1003) con il numero di righe esportate: best-effort, un errore
 * finisce nel log e non cambia l'export (T-805).
 */
export async function recordOnboardingExport(
  userId: string,
  projectId: string,
  countExportedRows: () => Promise<number>
): Promise<void> {
  try {
    await markOnboardingExportCompleted(userId, { projectId, exportedRows: await countExportedRows() });
  } catch (error) {
    logger.error("onboarding_export_mark_failed", { userId, projectId, error });
  }
}
