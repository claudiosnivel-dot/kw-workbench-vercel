import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { requirePageUser } from "@/lib/auth/page-guard";
import { readParam } from "@/lib/http/search-params";
import { activeJobIdOf } from "@/lib/modules/jobs/job-api";
import { type ProjectPageProps, requireProjectPage, SECTIONS_WITH_STATS } from "@/lib/modules/project-pages";
import { resolveDefaultSectionId, resultsHref } from "@/lib/modules/results-view";
import { formatDate, jobStatusTone } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params, searchParams }: ProjectPageProps) {
  const user = await requirePageUser();
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  const project = await requireProjectPage(user.id, id, {
    subprojects: SECTIONS_WITH_STATS,
    _count: { select: { seeds: true, keyword_candidates: true, jobs: true, subprojects: true } },
  });

  const selectedSectionId = readParam(resolvedSearchParams, "sectionId").trim();
  const defaultSectionId = resolveDefaultSectionId(project.subprojects, project.default_subproject_id);
  const activeSection =
    project.subprojects.find((item) => item.id === selectedSectionId) ??
    project.subprojects.find((item) => item.id === defaultSectionId) ??
    null;

  const activeLatestJob = activeSection?.jobs[0] ?? null;
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-sm text-slate-600">{t("projects.detail.intro")}</p>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">{t("projects.detail.sections")}</span> {project._count.subprojects}
            </p>
            <p>
              <span className="font-medium">{t("projects.detail.keywords")}</span> {project._count.keyword_candidates}
            </p>
            <p>
              <span className="font-medium">{t("projects.detail.seeds")}</span> {project._count.seeds}
            </p>
            <p>
              <span className="font-medium">{t("projects.detail.jobs")}</span> {project._count.jobs}
            </p>
          </div>
        </div>

        {activeSection ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <RunExtractionButton
              projectId={project.id}
              subprojectId={activeSection.id}
              label={t("projects.detail.runActive")}
              runningLabel={t("jobs.run.running")}
              resultsHref={resultsHref(project.id, { subprojectId: activeSection.id })}
              activeJobId={activeJobIdOf(activeLatestJob)}
            />
            <Link className="btn-secondary w-full text-center sm:w-auto" href={resultsHref(project.id, { subprojectId: activeSection.id })}>
              {t("projects.detail.openSectionResults")}
            </Link>
            <Link className="btn-secondary w-full text-center sm:w-auto" href={resultsHref(project.id, { view: "all" })}>
              {t("projects.detail.projectResults")}
            </Link>
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/strategy`}>
              {t("strategy.ui.title")}
            </Link>
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/settings`}>
              {t("projects.links.settings")}
            </Link>
            <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/sections`}>
              {t("projects.detail.manageSections")}
            </Link>
          </div>
        ) : (
          <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {t("projects.detail.noSections")}
          </p>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("projects.detail.selectActive")}</h2>

        {project.subprojects.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {project.subprojects.map((section) => {
              const isActive = activeSection?.id === section.id;
              return (
                <Link
                  key={section.id}
                  href={`/projects/${project.id}?sectionId=${section.id}`}
                  className={isActive ? "btn-primary" : "btn-secondary"}
                >
                  {section.name} ({section._count.keyword_candidates})
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("sections.empty")}</p>
        )}

        {activeSection && (
          <div className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">{t("projects.detail.activeSection", { name: activeSection.name })}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t("projects.detail.activeCounts", {
                    seeds: activeSection._count.seeds,
                    keywords: activeSection._count.keyword_candidates,
                    jobs: activeSection._count.jobs,
                  })}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("projects.detail.lastUpdate", { date: formatDate(activeSection.updated_at, format) })}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <RunExtractionButton
                projectId={project.id}
                subprojectId={activeSection.id}
                label={t("jobs.run.start")}
                runningLabel={t("jobs.run.running")}
                resultsHref={resultsHref(project.id, { subprojectId: activeSection.id })}
              />
              <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/subprojects/${activeSection.id}`}>
                {t("projects.detail.openSectionSettings")}
              </Link>
              <Link className="btn-secondary w-full text-center sm:w-auto" href={resultsHref(project.id, { subprojectId: activeSection.id })}>
                {t("projects.detail.openSectionResults")}
              </Link>
              {activeLatestJob ? (
                <span className={`status-chip ${jobStatusTone(activeLatestJob.status)}`}>
                  {t("projects.detail.lastJob", { status: t(`jobs.status.${activeLatestJob.status}`) })}
                </span>
              ) : (
                <span className="status-chip">{t("projects.detail.noJob")}</span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}