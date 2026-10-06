import { OnboardingProjectTargetingForm } from "@/components/onboarding-project-targeting-form";
import { requireOnboardingProject } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectTargetingPage() {
  const { project } = await requireOnboardingProject("PROJECT_TARGETING");
  return <OnboardingProjectTargetingForm project={project} />;
}
