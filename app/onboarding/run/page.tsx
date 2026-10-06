import { OnboardingRunStep } from "@/components/onboarding-run-step";
import { findActiveJobId } from "@/lib/modules/jobs/job-api";
import { resultsHref } from "@/lib/modules/results-view";
import { requireOnboardingSection } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingRunPage() {
  const { project, subproject } = await requireOnboardingSection("RUN");
  const activeJobId = await findActiveJobId(subproject.id);

  return (
    <OnboardingRunStep
      projectId={project.id}
      subprojectId={subproject.id}
      projectName={project.name}
      subprojectName={subproject.name}
      resultsHref={resultsHref(project.id, { subprojectId: subproject.id })}
      activeJobId={activeJobId}
    />
  );
}
