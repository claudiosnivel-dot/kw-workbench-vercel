import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PaginationLinks } from "@/components/pagination-links";
import { ProjectCard } from "@/components/project-card";
import { QuickStartForm } from "@/components/quick-start-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { canPerform } from "@/lib/authz/permissions";
import { getPageWorkspace } from "@/lib/authz/workspace";
import { listDashboardProjects } from "@/lib/modules/dashboard";
import { loadProjectsProgress } from "@/lib/modules/project-progress";
import { resolveDefaultTargeting } from "@/lib/modules/targeting";

export const dynamic = "force-dynamic";

/**
 * Home dell'app (T-2305, D-39). Al primo accesso (workspace attivo senza progetti) chiede solo di cosa parla il sito;
 * con progetti mostra lo stesso campo in forma compatta e i progetti in ordine di ultima attività (pagine da 20, T-810)
 * come schede con il loro prossimo passo. Lo stato delle tappe arriva con query aggregate per pagina dell'elenco.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const { page: rawPage } = await searchParams;

  // Workspace attivo (T-1504): cookie kwb_workspace riverificato, altrimenti il workspace personale.
  const { workspace } = await getPageWorkspace(user.id);
  const [dashboard, locale] = await Promise.all([
    listDashboardProjects(workspace.id, Array.isArray(rawPage) ? rawPage[0] : rawPage),
    getLocale(),
  ]);
  const targeting = await resolveDefaultTargeting(workspace.id, locale);

  if (dashboard.total === 0) {
    return (
      <section className="card px-4 py-10 sm:px-10 sm:py-14">
        <QuickStartForm variant="first" targeting={targeting} />
      </section>
    );
  }

  const { items: projects, total, page, totalPages } = dashboard;
  const [t, format, progress] = await Promise.all([
    getTranslations(),
    getFormatter(),
    loadProjectsProgress(projects.map((project) => project.id)),
  ]);
  const canDeleteProjects = canPerform(workspace.role, "project.delete");
  const now = new Date();

  return (
    <div className="space-y-6">
      <section className="card">
        <QuickStartForm variant="compact" targeting={targeting} />
      </section>

      <section className="card space-y-4">
        <h1 className="flex items-baseline gap-2 text-xl font-semibold">
          {t("dashboard.projects.title")} <span className="text-sm font-normal text-slate-500">{total}</span>
        </h1>
        <ul className="grid gap-3">
          {projects.map((project, index) => {
            const projectProgress = progress.get(project.id);
            if (!projectProgress) {
              return null;
            }
            return (
              <ProjectCard
                key={project.id}
                project={{ id: project.id, name: project.name }}
                lastActivity={{
                  iso: project.last_activity_at.toISOString(),
                  label: format.relativeTime(project.last_activity_at, now),
                }}
                progress={projectProgress}
                primary={index === 0}
                canDelete={canDeleteProjects}
              />
            );
          })}
        </ul>

        {totalPages > 1 && (
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-600">{t("common.pageOf", { page, total: totalPages })}</p>
            <PaginationLinks
              previousHref={page > 1 ? `/?page=${page - 1}` : null}
              nextHref={page < totalPages ? `/?page=${page + 1}` : null}
            />
          </div>
        )}
      </section>
    </div>
  );
}
