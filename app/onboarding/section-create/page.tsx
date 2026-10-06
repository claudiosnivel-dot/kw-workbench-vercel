import { redirect } from "next/navigation";
import { OnboardingSectionCreateForm } from "@/components/onboarding-section-create-form";
import { OnboardingStepDone } from "@/components/onboarding-step-done";
import { stepIndex, stepToPath } from "@/lib/onboarding/constants";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingSectionCreatePage() {
  const { state } = await requireOnboardingStep("SECTION_CREATE");

  if (!state.activeProject) {
    redirect("/onboarding/project-create");
  }

  // Sezione già creata: si prosegue senza crearne una seconda (T-1002, come project-create con T-1001).
  if (state.activeSubproject && stepIndex(state.currentStep) > stepIndex("SECTION_CREATE")) {
    return (
      <OnboardingStepDone
        heading="Step 4: Sezione creata"
        label="Sezione attiva"
        name={state.activeSubproject.name}
        continuePath={stepToPath(state.currentStep)}
      />
    );
  }

  return <OnboardingSectionCreateForm projectId={state.activeProject.id} projectName={state.activeProject.name} />;
}
