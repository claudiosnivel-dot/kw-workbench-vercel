import { redirect } from "next/navigation";
import { OnboardingSeedsForm } from "@/components/onboarding-seeds-form";
import { requireOnboardingStep } from "@/lib/onboarding/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingSeedsPage() {
  const { state } = await requireOnboardingStep("SEEDS");

  if (!state.activeProject) {
    redirect("/onboarding/project-create");
  }

  if (!state.activeSubproject) {
    redirect("/onboarding/section-create");
  }

  const rows = await prisma.seed.findMany({
    where: {
      project_id: state.activeProject.id,
      subproject_id: state.activeSubproject.id,
    },
    orderBy: { created_at: "asc" },
    select: { keyword: true },
  });

  return (
    <OnboardingSeedsForm
      project={state.activeProject}
      subproject={state.activeSubproject}
      initialSeeds={rows.map((row) => row.keyword).join("\n")}
    />
  );
}
