import { JobStatus } from "@/lib/generated/prisma/enums";
import type { OnboardingStepKey } from "@/lib/onboarding/constants";
import { prisma } from "@/lib/prisma";

export type OnboardingPrecondition = "seeds" | "job";

// Precondizioni verificate dal server (T-1003): il run richiede seed sulla sezione attiva, la revisione e
// l'export un job completato (esito reale del job, T-305).
const STEP_PRECONDITION: Partial<Record<OnboardingStepKey, OnboardingPrecondition>> = {
  RUN: "seeds",
  REVIEW_EXPORT: "job",
};

/** Passo in cui si soddisfa la precondizione mancante. */
export const PRECONDITION_STEP: Record<OnboardingPrecondition, OnboardingStepKey> = {
  seeds: "SEEDS",
  job: "RUN",
};

/** Precondizione del passo non soddisfatta sulla sezione attiva, oppure null. */
export async function missingPrecondition(
  step: OnboardingStepKey,
  activeSubprojectId: string | null
): Promise<OnboardingPrecondition | null> {
  const precondition = STEP_PRECONDITION[step];
  if (!precondition) {
    return null;
  }

  if (!activeSubprojectId) {
    return precondition;
  }

  const count =
    precondition === "seeds"
      ? await prisma.seed.count({ where: { subproject_id: activeSubprojectId } })
      : await prisma.job.count({ where: { subproject_id: activeSubprojectId, status: JobStatus.completed } });
  return count > 0 ? null : precondition;
}
