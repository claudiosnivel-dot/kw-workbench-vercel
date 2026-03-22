import { redirect } from "next/navigation";
import { OnboardingRunStep } from "@/components/onboarding-run-step";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingRunPage() {
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
