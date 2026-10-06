import { OnboardingProjectCreateForm } from "@/components/onboarding-project-create-form";
import { OnboardingStepDone } from "@/components/onboarding-step-done";
import { continuePathAfter, requireOnboardingStep } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectCreatePage() {
  const { state } = await requireOnboardingStep("PROJECT_CREATE");

  // Progetto già creato (anche dopo Ricomincia): il back del browser non porta a una seconda creazione (T-1001).
  const continuePath = continuePathAfter(state, "PROJECT_CREATE");
  if (state.activeProject && continuePath) {
    return (
      <OnboardingStepDone
        heading="Step 2: Progetto creato"
        label="Progetto attivo"
        name={state.activeProject.name}
        continuePath={continuePath}
      />
    );
  }

  return <OnboardingProjectCreateForm />;
}
