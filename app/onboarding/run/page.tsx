import { OnboardingRunStep } from "@/components/onboarding-run-step";
import { requireOnboardingSection } from "@/lib/onboarding/navigation";

export const dynamic = "force-dynamic";

export default async function OnboardingRunPage() {
  const { project, subproject } = await requireOnboardingSection("RUN");

  return (
    <OnboardingRunStep
      projectId={project.id}
      subprojectId={subproject.id}
      projectName={project.name}
      subprojectName={subproject.name}
    />
  );
}
