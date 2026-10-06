import { OnboardingSectionCreateForm } from "@/components/onboarding-section-create-form";
import { OnboardingStepDone } from "@/components/onboarding-step-done";
import { continuePathAfter, requireOnboardingProject } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingSectionCreatePage() {
  const { state, project } = await requireOnboardingProject("SECTION_CREATE");

  // Sezione già creata: si prosegue senza crearne una seconda (T-1002, come project-create con T-1001).
  const continuePath = continuePathAfter(state, "SECTION_CREATE");
  if (state.activeSubproject && continuePath) {
    return (
      <OnboardingStepDone
        heading="Step 4: Sezione creata"
        label="Sezione attiva"
        name={state.activeSubproject.name}
        continuePath={continuePath}
      />
    );
  }

  return <OnboardingSectionCreateForm projectId={project.id} projectName={project.name} />;
}
