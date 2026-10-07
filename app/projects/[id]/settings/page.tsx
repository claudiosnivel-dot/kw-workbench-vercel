import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { ProjectForm } from "@/components/project-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { projectDeleteTarget } from "@/lib/view/delete-targets";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  const project = await requireProjectPage(user.id, id, {
    subprojects: { orderBy: [{ position: "asc" }, { created_at: "asc" }], select: { id: true, name: true } },
  });
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h1 className="text-2xl font-semibold">{t("projects.settings.title")}</h1>
        <p className="text-sm text-slate-600">{t("projects.settings.intro")}</p>
        <ProjectForm
          mode="edit"
          projectId={project.id}
          canEditAutocompleteProvider={user.isRootAdmin}
          showSeeds={false}
          showInitialSubprojectName={false}
          initialValues={{
            name: project.name,
            language_code: project.language_code,
            country_code: project.country_code,
            initial_subproject_name: t("projects.form.defaultSectionName"),
            seeds: "",
            autocomplete_provider: project.autocomplete_provider,
            metrics_provider: project.metrics_provider,
            min_volume: project.min_volume,
            exclude_brands: project.exclude_brands,
            expand_alpha: project.expand_alpha,
            expand_numeric: project.expand_numeric,
            expand_patterns: project.expand_patterns,
            auto_classification: project.auto_classification,
            scoring_profile: project.scoring_profile,
          }}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">{t("projects.settings.linkedSections")}</h2>
        <div className="flex flex-wrap gap-2">
          {project.subprojects.map((subproject) => (
            <Link key={subproject.id} className="btn-secondary" href={`/projects/${project.id}/subprojects/${subproject.id}`}>
              {subproject.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Eliminazione del progetto solo per chi ha project.delete (ADMIN e OWNER, D-08); la rotta la riverifica. */}
      {canPerform(project.role, "project.delete") && (
        <DangerZoneCard warning={t("projects.settings.deleteWarning")}>
          <DeleteEntityButton
            {...projectDeleteTarget(project)}
            buttonLabel={t("projects.settings.deleteButton")}
            buttonClassName="btn btn-danger w-full sm:w-auto"
            redirectTo="/"
          />
        </DangerZoneCard>
      )}
    </div>
  );
}


