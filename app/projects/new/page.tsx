import { getTranslations } from "next-intl/server";
import { PageIntro } from "@/components/page-intro";
import { ProjectForm } from "@/components/project-form";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await requirePageUser();
  const t = await getTranslations("projects.new");

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />

      <section className="card">
        <ProjectForm mode="create" canEditAutocompleteProvider={user.isRootAdmin} showSeeds={true} showInitialSubprojectName={true} />
      </section>
    </div>
  );
}

