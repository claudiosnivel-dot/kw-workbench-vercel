import { OnboardingProjectCreateForm } from "@/components/onboarding-project-create-form";
import { OnboardingStepDone } from "@/components/onboarding-step-done";
import { stepIndex, stepToPath } from "@/lib/onboarding/constants";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectCreatePage() {
  const { state } = await requireOnboardingStep("PROJECT_CREATE");

  // Progetto già creato (anche dopo Ricomincia): il back del browser non porta a una seconda creazione (T-1001).
  if (state.activeProject && stepIndex(state.currentStep) > stepIndex("PROJECT_CREATE")) {
    return (
      <OnboardingStepDone
        heading="Step 2: Progetto creato"
        label="Progetto attivo"
        name={state.activeProject.name}
        continuePath={stepToPath(state.currentStep)}
      />
    );
  }

  return <OnboardingProjectCreateForm />;
}
