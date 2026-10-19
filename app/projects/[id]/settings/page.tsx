import { getTranslations } from "next-intl/server";
import { PageIntro } from "@/components/page-intro";
import { ProjectBrands } from "@/components/project-brands";
import { ProjectDeleteCard } from "@/components/project-delete-card";
import { ProjectSettingsForm } from "@/components/project-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { listProjectBrands } from "@/lib/modules/project-brands";
import { requireProjectPage } from "@/lib/modules/project-pages";

export const dynamic = "force-dynamic";

/**
 * Impostazioni del progetto (T-2602): «Il progetto», i marchi dei concorrenti (T-2601), la scheda «Per gli articoli»
 * modificabile con project.update (T-4001), le Avanzate chiuse e, in fondo, «Elimina il progetto» solo con
 * project.delete (ADMIN e OWNER, D-08); le rotte lo riverificano.
 */
export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  const project = await requireProjectPage(user.id, id, {});
  const [brands, t] = await Promise.all([listProjectBrands(project.id), getTranslations("projects.settings")]);

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />
      <ProjectSettingsForm
        projectId={project.id}
        canEditAutocompleteProvider={user.isRootAdmin}
        canEditArticleBrief={canPerform(project.role, "project.update")}
        initialValues={{
          name: project.name,
          language_code: project.language_code,
          country_code: project.country_code,
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
        initialArticleBrief={{
          article_about: project.article_about ?? "",
          article_audience: project.article_audience ?? "",
          article_tone: project.article_tone,
          business_name: project.business_name ?? "",
          business_address: project.business_address ?? "",
          site_url: project.site_url ?? "",
        }}
        brands={<ProjectBrands projectId={project.id} brands={brands} />}
      />
      {canPerform(project.role, "project.delete") && <ProjectDeleteCard project={{ id: project.id, name: project.name }} />}
    </div>
  );
}
