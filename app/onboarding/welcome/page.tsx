import { OnboardingWelcomeActions } from "@/components/onboarding-welcome-actions";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingWelcomePage() {
  const { state } = await requireOnboardingStep("WELCOME");
  return <OnboardingWelcomeActions hasExistingData={state.hasExistingData} />;
}
