import { OnboardingSeedsForm } from "@/components/onboarding-seeds-form";
import { requireOnboardingSection } from "@/lib/onboarding/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingSeedsPage() {
  const { project, subproject } = await requireOnboardingSection("SEEDS");

  const rows = await prisma.seed.findMany({
    where: {
      project_id: project.id,
      subproject_id: subproject.id,
    },
    orderBy: { created_at: "asc" },
    select: { keyword: true },
  });

  return (
    <OnboardingSeedsForm
      project={project}
      subproject={subproject}
      initialSeeds={rows.map((row) => row.keyword).join("\n")}
    />
  );
}
