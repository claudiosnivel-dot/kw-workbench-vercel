import { redirect } from "next/navigation";
import { OnboardingReviewExportStep } from "@/components/onboarding-review-export-step";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingReviewExportPage() {
  const { user, state } = await requireOnboardingStep("REVIEW_EXPORT");

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
