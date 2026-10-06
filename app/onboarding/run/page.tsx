import { redirect } from "next/navigation";
import { OnboardingRunStep } from "@/components/onboarding-run-step";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingRunPage() {
  const { state } = await requireOnboardingStep("RUN");

  if (!state.activeProject) {
    redirect("/onboarding/project-create");
  }

  if (!state.activeSubproject) {
    redirect("/onboarding/section-create");
  }

  return (
    <OnboardingRunStep
      projectId={state.activeProject.id}
      subprojectId={state.activeSubproject.id}
      projectName={state.activeProject.name}
      subprojectName={state.activeSubproject.name}
    />
  );
}
