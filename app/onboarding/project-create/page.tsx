import { redirect } from "next/navigation";
import { OnboardingProjectCreateForm } from "@/components/onboarding-project-create-form";
import { OnboardingStepDone } from "@/components/onboarding-step-done";
import { requirePageUser } from "@/lib/auth/page-guard";
import { stepIndex, stepToPath } from "@/lib/onboarding/constants";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectCreatePage() {
  const user = await requirePageUser();
  const state = await getOnboardingStateForUser(user.id);

  if (state.status === "COMPLETED") {
    redirect("/");
  }

  if (state.status === "NEEDS_CHOICE") {
    redirect("/onboarding/welcome");
  }

  if (state.activeProjectId && state.entryMode === "RESUME") {
    redirect("/onboarding/project-targeting");
  }

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
