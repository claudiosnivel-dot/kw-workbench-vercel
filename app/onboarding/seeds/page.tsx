import { redirect } from "next/navigation";
import { OnboardingSeedsForm } from "@/components/onboarding-seeds-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getOnboardingStateForUser } from "@/lib/onboarding/progress";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingSeedsPage() {
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
