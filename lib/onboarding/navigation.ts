import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-guard";
import { type OnboardingStepKey, stepIndex, stepToPath } from "@/lib/onboarding/constants";
import { missingPrecondition, PRECONDITION_STEP } from "@/lib/onboarding/preconditions";
import { getOnboardingStateForUser, type OnboardingState } from "@/lib/onboarding/progress";

export type StepAccess = { kind: "render" } | { kind: "redirect"; path: string };

/**
 * Regola unica di accesso ai passi dell'onboarding (T-1002): un passo con indice minore o uguale a current_step
 * si rende (i link «Torna allo step precedente» non rimbalzano); un passo oltre recommendedStep, cioè senza i
 * dati che gli servono, reindirizza a recommendedStep. Onboarding completato -> dashboard; scelta non ancora
 * fatta -> benvenuto.
 */
export function resolveStepAccess(
  state: Pick<OnboardingState, "status" | "currentStep" | "recommendedStep">,
  step: OnboardingStepKey
): StepAccess {
  if (state.status === "COMPLETED") {
    return { kind: "redirect", path: "/" };
  }

  if (state.status === "NEEDS_CHOICE" && step !== "WELCOME") {
    return { kind: "redirect", path: stepToPath("WELCOME") };
  }

  if (stepIndex(step) <= stepIndex(state.currentStep)) {
    return { kind: "render" };
  }

  if (stepIndex(step) > stepIndex(state.recommendedStep)) {
    return { kind: "redirect", path: stepToPath(state.recommendedStep) };
  }

  return { kind: "render" };
}

/** Utente e stato dell'onboarding per la pagina del passo, dopo la regola di accesso (redirect se non ammesso). */
export async function requireOnboardingStep(step: OnboardingStepKey) {
  const user = await requirePageUser();
  const state = await getOnboardingStateForUser(user.id);
  const access = resolveStepAccess(state, step);
  if (access.kind === "redirect") {
    redirect(access.path);
  }

  return { user, state };
}

/** Passi che richiedono il progetto attivo: senza, si torna alla sua creazione. */
export async function requireOnboardingProject(step: OnboardingStepKey) {
  const { user, state } = await requireOnboardingStep(step);
  if (!state.activeProject) {
    redirect(stepToPath("PROJECT_CREATE"));
  }

  return { user, state, project: state.activeProject };
}

/**
 * Passi che richiedono progetto e sezione attivi, con le precondizioni del passo (T-1003): se ne manca una si
 * torna al passo che la soddisfa.
 */
export async function requireOnboardingSection(step: OnboardingStepKey) {
  const { user, state, project } = await requireOnboardingProject(step);
  if (!state.activeSubproject) {
    redirect(stepToPath("SECTION_CREATE"));
  }

  const missing = await missingPrecondition(step, state.activeSubproject.id);
  if (missing) {
    redirect(stepToPath(PRECONDITION_STEP[missing]));
  }

  return { user, state, project, subproject: state.activeSubproject };
}

/** Passo successivo da cui riprendere se il passo indicato è già stato superato, altrimenti null. */
export function continuePathAfter(state: Pick<OnboardingState, "currentStep">, step: OnboardingStepKey): string | null {
  return stepIndex(state.currentStep) > stepIndex(step) ? stepToPath(state.currentStep) : null;
}
