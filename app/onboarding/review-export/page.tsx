import { redirect } from "next/navigation";
import { OnboardingReviewExportStep } from "@/components/onboarding-review-export-step";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingReviewExportPage() {
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

  const [projectKeywordCount, sectionKeywordCount, googleSheets] = await Promise.all([
    prisma.keywordCandidate.count({
      where: { project_id: state.activeProject.id },
    }),
    prisma.keywordCandidate.count({
      where: {
        project_id: state.activeProject.id,
        subproject_id: state.activeSubproject.id,
      },
    }),
    getGoogleSheetsCredentialSnapshot(user.id),
  ]);

  return (
    <OnboardingReviewExportStep
      projectId={state.activeProject.id}
      subprojectId={state.activeSubproject.id}
      projectName={state.activeProject.name}
      subprojectName={state.activeSubproject.name}
      projectKeywordCount={projectKeywordCount}
      sectionKeywordCount={sectionKeywordCount}
      googleSheetsConnected={googleSheets.connected}
    />
  );
}
