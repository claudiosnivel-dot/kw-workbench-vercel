import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page-guard";
import { type OnboardingStepKey, stepIndex, stepToPath } from "@/lib/onboarding/constants";
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
