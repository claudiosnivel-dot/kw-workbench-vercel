import { redirect } from "next/navigation";
import { OnboardingProjectTargetingForm } from "@/components/onboarding-project-targeting-form";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectTargetingPage() {
  const { state } = await requireOnboardingStep("PROJECT_TARGETING");

  if (!state.activeProject) {
    redirect("/onboarding/project-create");
  }

  return <OnboardingProjectTargetingForm project={state.activeProject} />;
}
