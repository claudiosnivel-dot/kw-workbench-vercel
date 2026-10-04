import { redirect } from "next/navigation";
import { OnboardingWelcomeActions } from "@/components/onboarding-welcome-actions";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingWelcomePage() {
  const user = await requirePageUser();
  const state = await getOnboardingStateForUser(user.id);

  if (state.status === "COMPLETED") {
    redirect("/");
  }

  return <OnboardingWelcomeActions hasExistingData={state.hasExistingData} />;
}
