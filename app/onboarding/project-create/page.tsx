import { redirect } from "next/navigation";
import { OnboardingProjectCreateForm } from "@/components/onboarding-project-create-form";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingProjectCreatePage() {
  const user = await requireAuthenticatedUserFromCookies();
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

  return <OnboardingProjectCreateForm />;
}
