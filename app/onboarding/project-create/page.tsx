import { redirect } from "next/navigation";
import { OnboardingProjectCreateForm } from "@/components/onboarding-project-create-form";
import { requirePageUser } from "@/lib/auth/page-guard";
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

  return <OnboardingProjectCreateForm />;
}
