import { redirect } from "next/navigation";
import { OnboardingSectionCreateForm } from "@/components/onboarding-section-create-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";

export const dynamic = "force-dynamic";

export default async function OnboardingSectionCreatePage() {
  const user = await requirePageUser();
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

  if (state.activeSubprojectId && state.entryMode === "RESUME") {
    redirect("/onboarding/seeds");
  }

  return <OnboardingSectionCreateForm projectId={state.activeProject.id} projectName={state.activeProject.name} />;
}
