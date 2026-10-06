import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { PageHeaderCard } from "@/components/page-header-card";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { SubprojectForm } from "@/components/subproject-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { resultsHref } from "@/lib/modules/results-view";
import { prisma } from "@/lib/prisma";
import { sectionDeleteTarget } from "@/lib/view/delete-targets";

export const dynamic = "force-dynamic";

export default async function SubprojectSettingsPage({
  params,
}: {
  params: Promise<{ id: string; subprojectId: string }>;
}) {
  const user = await requirePageUser();
  const { id, subprojectId } = await params;

  const subproject = await prisma.subproject.findFirst({
    where: {
      id: subprojectId,
      project_id: id,
      project: {
        owner_user_id: user.id,
      },
    },
    include: {
      project: true,
      seeds: { orderBy: { created_at: "asc" } },
      _count: {
        select: {
          keyword_candidates: true,
          jobs: true,
        },
      },
    },
  });

  if (!subproject) {
    notFound();
  }

  const effective = resolveEffectiveProjectSettings({
    project: subproject.project,
    subproject,
  });

  return (
    <div className="space-y-6">
      <PageHeaderCard
        title={`Sezione: ${subproject.name}`}
        subtitle={`Progetto: ${subproject.project.name}`}
        action={
          <RunExtractionButton
            runPath={`/api/projects/${subproject.project_id}/subprojects/${subproject.id}/run`}
            label="Avvia estrazione"
            runningLabel="Estrazione in corso..."
          />
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${subproject.project_id}`}>
            Torna al progetto
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={resultsHref(subproject.project_id, { subprojectId: subproject.id })}>
            Vedi risultati sezione
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={resultsHref(subproject.project_id, { view: "all" })}>
            Vedi risultati tutto progetto
          </Link>
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <p>
            <span className="font-medium">Keyword sezione:</span> {subproject._count.keyword_candidates}
          </p>
          <p>
            <span className="font-medium">Job:</span> {subproject._count.jobs}
          </p>
          <p>
            <span className="font-medium">Locale effettivo:</span> {effective.language_code}-{effective.country_code}
          </p>
        </div>
      </PageHeaderCard>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Impostazioni sezione</h2>
        <SubprojectForm
          mode="edit"
          projectId={subproject.project_id}
          subprojectId={subproject.id}
          canEditAutocompleteProvider={user.isRootAdmin}
          showAdvanced={true}
          initialValues={{
            name: subproject.name,
            description: subproject.description ?? "",
            seeds: subproject.seeds.map((seed) => seed.keyword).join("\n"),
            language_code_override: subproject.language_code_override ?? "",
            country_code_override: subproject.country_code_override ?? "",
            autocomplete_provider_override: subproject.autocomplete_provider_override ?? "",
            metrics_provider_override: subproject.metrics_provider_override ?? "",
            min_volume_override:
              subproject.min_volume_override == null ? "" : String(subproject.min_volume_override),
            exclude_brands_override:
              subproject.exclude_brands_override == null ? "inherit" : subproject.exclude_brands_override ? "true" : "false",
            expand_alpha_override:
              subproject.expand_alpha_override == null ? "inherit" : subproject.expand_alpha_override ? "true" : "false",
            expand_numeric_override:
              subproject.expand_numeric_override == null ? "inherit" : subproject.expand_numeric_override ? "true" : "false",
            expand_patterns_override:
              subproject.expand_patterns_override == null
                ? "inherit"
                : subproject.expand_patterns_override
                  ? "true"
                  : "false",
            auto_classification_override:
              subproject.auto_classification_override == null
                ? "inherit"
                : subproject.auto_classification_override
                  ? "true"
                  : "false",
            scoring_profile_override: subproject.scoring_profile_override ?? "",
          }}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold text-red-700">Zona pericolosa</h2>
        <p className="mb-4 text-sm text-slate-600">
          Eliminando questa sezione verranno rimossi seed, keyword e job collegati. Il progetto restera attivo.
        </p>
        <DeleteEntityButton
          {...sectionDeleteTarget(subproject.project_id, subproject)}
          buttonClassName="btn btn-danger w-full sm:w-auto"
          redirectTo={`/projects/${subproject.project_id}`}
        />
      </section>
    </div>
  );
}




