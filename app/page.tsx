import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { PaginationLinks } from "@/components/pagination-links";
import { ResumeOnboardingButton } from "@/components/resume-onboarding-button";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { getPageWorkspace } from "@/lib/authz/workspace";
import { listDashboardProjects } from "@/lib/modules/dashboard";
import { resultsHref } from "@/lib/modules/results-view";
import { getOnboardingStatusForUser, shouldRedirectUserToOnboarding } from "@/lib/onboarding/progress";
import { prisma } from "@/lib/prisma";
import { projectDeleteTarget } from "@/lib/view/delete-targets";
import { formatDate, jobStatusTone } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { page: rawPage } = await searchParams;
  // Solo lo status: una query e nessuna scrittura (T-1004).
  const onboardingStatus = await getOnboardingStatusForUser(user.id);

  if (shouldRedirectUserToOnboarding(onboardingStatus)) {
    redirect("/onboarding");
  }

  // Workspace attivo (T-1504): cookie kwb_workspace riverificato, altrimenti il workspace personale.
  const { workspace } = await getPageWorkspace(user.id);
  const inWorkspace = { project: { workspace_id: workspace.id } };
  const canDeleteProjects = canPerform(workspace.role, "project.delete");

  const [t, format, dashboard, recentJobs, totalKeywords, totalSubprojects] = await Promise.all([
    getTranslations(),
    getFormatter(),
    // Progetti del workspace attivo: pagine da 20 in ordine di ultima attività (T-810).
    listDashboardProjects(workspace.id, Array.isArray(rawPage) ? rawPage[0] : rawPage),
    prisma.job.findMany({
      where: inWorkspace,
      orderBy: { created_at: "desc" },
      include: {
        project: {
          select: { id: true, name: true },
        },
        subproject: {
          select: { id: true, name: true },
        },
      },
      take: 15,
    }),
    prisma.keywordCandidate.count({ where: inWorkspace }),
    prisma.subproject.count({ where: inWorkspace }),
  ]);
  const { items: projects, total: totalProjects, page, totalPages } = dashboard;

  return (
    <div className="space-y-6">
      {onboardingStatus === "PAUSED" && (
        <section className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{t("dashboard.paused.eyebrow")}</p>
              <h2 className="mt-1 text-xl font-semibold">{t("dashboard.paused.title")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t("dashboard.paused.body")}</p>
            </div>
            <ResumeOnboardingButton className="w-full sm:w-auto" />
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{t("dashboard.eyebrow")}</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl sm:leading-10">{t("dashboard.title")}</h1>
            <p className="text-sm text-slate-600 sm:text-base">{t("dashboard.intro")}</p>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
              <Link href="/projects/new" className="btn-primary w-full text-center sm:w-auto">
                {t("dashboard.createProject")}
              </Link>
              {user.role === "ADMIN" && (
                <Link href="/admin" className="btn-secondary w-full text-center sm:w-auto">
                  {t("dashboard.adminDashboard")}
                </Link>
              )}
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("dashboard.stats.projects")}</p>
              <p className="mt-1 text-2xl font-semibold">{totalProjects}</p>
            </article>
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("dashboard.stats.sections")}</p>
              <p className="mt-1 text-2xl font-semibold">{totalSubprojects}</p>
            </article>
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("dashboard.stats.keywords")}</p>
              <p className="mt-1 text-2xl font-semibold">{totalKeywords}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">{t("dashboard.projects.title")}</h2>
          <Link href="/projects/new" className="btn-primary w-full text-center sm:w-auto">
            {t("dashboard.projects.new")}
          </Link>
        </div>

        <div className="table-shell">
          <table className="table-enterprise min-w-[820px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("dashboard.projects.columns.name")}</th>
                <th className="px-3 py-2">{t("dashboard.projects.columns.sections")}</th>
                <th className="px-3 py-2">{t("dashboard.projects.columns.seeds")}</th>
                <th className="px-3 py-2">{t("dashboard.projects.columns.keywords")}</th>
                <th className="px-3 py-2">{t("dashboard.projects.columns.updated")}</th>
                <th className="px-3 py-2">{t("dashboard.projects.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-3 py-3 font-medium">{project.name}</td>
                  <td className="px-3 py-3">{project._count.subprojects}</td>
                  <td className="px-3 py-3">{project._count.seeds}</td>
                  <td className="px-3 py-3">{project._count.keyword_candidates}</td>
                  <td className="px-3 py-3">{formatDate(project.last_activity_at, format)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="btn-secondary" href={`/projects/${project.id}`}>
                        {t("dashboard.projects.open")}
                      </Link>
                      <Link className="btn-secondary" href={resultsHref(project.id, { view: "all" })}>
                        {t("dashboard.projects.results")}
                      </Link>
                      {canDeleteProjects && <DeleteEntityButton {...projectDeleteTarget(project)} showInlineError={false} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projects.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">{t("dashboard.projects.empty")}</p>}
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">{t("common.pageOf", { page, total: totalPages })}</p>
          <PaginationLinks
            previousHref={page > 1 ? `/?page=${page - 1}` : null}
            nextHref={page < totalPages ? `/?page=${page + 1}` : null}
          />
        </div>
      </section>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">{t("dashboard.jobs.title")}</h2>

        <div className="table-shell">
          <table className="table-enterprise min-w-[680px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">{t("dashboard.jobs.columns.project")}</th>
                <th className="px-3 py-2">{t("dashboard.jobs.columns.section")}</th>
                <th className="px-3 py-2">{t("dashboard.jobs.columns.status")}</th>
                <th className="px-3 py-2">{t("dashboard.jobs.columns.started")}</th>
                <th className="px-3 py-2">{t("dashboard.jobs.columns.completed")}</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-3">
                    <Link className="font-medium text-emerald-700 underline-offset-2 hover:underline" href={`/projects/${job.project.id}`}>
                      {job.project.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      className="text-sm text-slate-500 underline-offset-2 hover:text-slate-100 hover:underline"
                      href={`/projects/${job.project.id}/subprojects/${job.subproject.id}`}
                    >
                      {job.subproject.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 uppercase">
                    <span className={`status-chip ${jobStatusTone(job.status)}`}>{t(`jobs.status.${job.status}`)}</span>
                  </td>
                  <td className="px-3 py-3">{formatDate(job.started_at, format)}</td>
                  <td className="px-3 py-3">{formatDate(job.completed_at, format)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentJobs.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">{t("dashboard.jobs.empty")}</p>}
        </div>
      </section>
    </div>
  );
}


