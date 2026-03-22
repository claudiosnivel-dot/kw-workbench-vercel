import { redirect } from "next/navigation";
import { OnboardingProjectTargetingForm } from "@/components/onboarding-project-targeting-form";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectTargetingPage() {
  const user = await requireAuthenticatedUserFromCookies();
  const state = await getOnboardingStateForUser(user.id);

  if (state.status === "COMPLETED") {
    redirect("/");
  }

  if (state.status === "NEEDS_CHOICE") {
    redirect("/onboarding/welcome");
  }

  if (!state.activeProject) {
    redirect("/onboarding/project-create");
  }

  return <OnboardingProjectTargetingForm project={state.activeProject} />;
}
