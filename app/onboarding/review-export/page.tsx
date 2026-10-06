import { OnboardingReviewExportStep } from "@/components/onboarding-review-export-step";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { requireOnboardingSection } from "@/lib/onboarding/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingReviewExportPage() {
  const { user, project, subproject } = await requireOnboardingSection("REVIEW_EXPORT");

  const [projectKeywordCount, sectionKeywordCount, googleSheets] = await Promise.all([
    prisma.keywordCandidate.count({
      where: { project_id: project.id },
    }),
    prisma.keywordCandidate.count({
      where: {
        project_id: project.id,
        subproject_id: subproject.id,
      },
    }),
    getGoogleSheetsCredentialSnapshot(user.id),
  ]);

  return (
    <OnboardingReviewExportStep
      projectId={project.id}
      subprojectId={subproject.id}
      projectName={project.name}
      subprojectName={subproject.name}
      projectKeywordCount={projectKeywordCount}
      sectionKeywordCount={sectionKeywordCount}
      googleSheetsConnected={googleSheets.connected}
    />
  );
}
