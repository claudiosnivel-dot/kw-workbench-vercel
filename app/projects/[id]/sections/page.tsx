import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { PageHeaderCard } from "@/components/page-header-card";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { SectionOrderButtons } from "@/components/section-order-buttons";
import { SetDefaultSectionButton } from "@/components/set-default-section-button";
import { SubprojectForm } from "@/components/subproject-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { activeJobIdOf } from "@/lib/modules/jobs/job-api";
import { requireProjectPage, SECTIONS_WITH_STATS } from "@/lib/modules/project-pages";
import { resultsHref } from "@/lib/modules/results-view";
import { sectionDeleteTarget } from "@/lib/view/delete-targets";
import { jobStatusTone } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function ProjectSectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  const project = await requireProjectPage(user.id, id, { subprojects: SECTIONS_WITH_STATS });
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <PageHeaderCard
        title={t("sections.manage.title")}
        subtitle={
          <>
            {t("sections.manage.projectLabel")} <span className="font-medium">{project.name}</span>
          </>
        }
        action={
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}`}>
            {t("projects.links.backToProject")}
          </Link>
        }
      />

      <section className="card space-y-3">
        <h2 className="text-base font-semibold">{t("sections.manage.addTitle")}</h2>
        <SubprojectForm mode="create" projectId={project.id} canEditAutocompleteProvider={user.isRootAdmin} showAdvanced={false} />
      </section>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">{t("sections.manage.listTitle")}</h2>
        <div className="table-shell">
          <table className="table-enterprise min-w-[980px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("sections.manage.columns.order")}</th>
                <th className="px-3 py-2">{t("sections.manage.columns.name")}</th>
                <th className="px-3 py-2">{t("sections.manage.columns.seeds")}</th>
                <th className="px-3 py-2">{t("sections.manage.columns.keywords")}</th>
                <th className="px-3 py-2">{t("sections.manage.columns.lastJob")}</th>
                <th className="px-3 py-2">{t("sections.manage.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {project.subprojects.map((section, index) => {
                const latestJob = section.jobs[0] ?? null;

                return (
                  <tr key={section.id}>
                    <td className="px-3 py-3">
                      <SectionOrderButtons
                        projectId={project.id}
                        subprojectId={section.id}
                        subprojectName={section.name}
                        disableUp={index === 0}
                        disableDown={index === project.subprojects.length - 1}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium">{section.name}</td>
                    <td className="px-3 py-3">{section._count.seeds}</td>
                    <td className="px-3 py-3">{section._count.keyword_candidates}</td>
                    <td className="px-3 py-3">
                      {latestJob ? (
                        <span className={`status-chip ${jobStatusTone(latestJob.status)}`}>{t(`jobs.status.${latestJob.status}`)}</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn-secondary" href={`/projects/${project.id}/subprojects/${section.id}`}>
                          {t("sections.manage.renameSettings")}
                        </Link>
                        <Link className="btn-secondary" href={resultsHref(project.id, { subprojectId: section.id })}>
                          {t("sections.manage.results")}
                        </Link>
                        <SetDefaultSectionButton
                          projectId={project.id}
                          subprojectId={section.id}
                          isDefault={project.default_subproject_id === section.id}
                        />
                        <RunExtractionButton
                          runPath={`/api/projects/${project.id}/subprojects/${section.id}/run`}
                          label={t("sections.manage.run")}
                          runningLabel={t("sections.manage.running")}
                          resultsHref={resultsHref(project.id, { subprojectId: section.id })}
                          activeJobId={activeJobIdOf(latestJob)}
                        />
                        <DeleteEntityButton {...sectionDeleteTarget(project.id, section)} showInlineError={false} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {project.subprojects.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">{t("sections.empty")}</p>}
        </div>
      </section>
    </div>
  );
}