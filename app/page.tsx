import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { PaginationLinks } from "@/components/pagination-links";
import { ResumeOnboardingButton } from "@/components/resume-onboarding-button";
import { requirePageUser } from "@/lib/auth/page-guard";
import { listDashboardProjects } from "@/lib/modules/dashboard";
import { resultsHref } from "@/lib/modules/results-view";
import { getOnboardingStateForUser, shouldRedirectUserToOnboarding } from "@/lib/onboarding/progress";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function jobStatusTone(value: string): string {
  if (value === "completed") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (value === "failed") return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  if (value === "running") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  return "border-slate-500/40 bg-slate-700/25 text-slate-200";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { page: rawPage } = await searchParams;
  const onboardingState = await getOnboardingStateForUser(user.id);

  if (shouldRedirectUserToOnboarding(onboardingState.status)) {
    redirect("/onboarding");
  }

  const [dashboard, recentJobs, totalKeywords, totalSubprojects] = await Promise.all([
    // Tutti i progetti raggiungibili: pagine da 20 in ordine di ultima attività (T-810).
    listDashboardProjects(user.id, Array.isArray(rawPage) ? rawPage[0] : rawPage),
    prisma.job.findMany({
      where: {
        project: {
          owner_user_id: user.id,
        },
      },
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
    prisma.keywordCandidate.count({
      where: {
        project: {
          owner_user_id: user.id,
        },
      },
    }),
    prisma.subproject.count({
      where: {
        project: {
          owner_user_id: user.id,
        },
      },
    }),
  ]);
  const { items: projects, total: totalProjects, page, totalPages } = dashboard;

  return (
    <div className="space-y-6">
      {onboardingState.status === "PAUSED" && (
        <section className="card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Onboarding in pausa</p>
              <h2 className="mt-1 text-xl font-semibold">Riprendi il percorso guidato A-Z</h2>
              <p className="mt-1 text-sm text-slate-600">
                Puoi continuare dal punto in cui hai messo in pausa e arrivare al primo export.
              </p>
            </div>
            <ResumeOnboardingButton className="w-full sm:w-auto" />
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Panoramica</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl sm:leading-10">
              Controlla i tuoi progetti SEO e organizza il lavoro per sezioni
            </h1>
            <p className="text-sm text-slate-600 sm:text-base">
              Ogni progetto puo contenere una o piu sezioni: puoi lavorare in blocco unico oppure separare per categoria, cluster o funnel.
            </p>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
              <Link href="/projects/new" className="btn-primary w-full text-center sm:w-auto">
                Crea progetto
              </Link>
              {user.role === "ADMIN" && (
                <Link href="/admin" className="btn-secondary w-full text-center sm:w-auto">
                  Dashboard admin
                </Link>
              )}
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Progetti</p>
              <p className="mt-1 text-2xl font-semibold">{totalProjects}</p>
            </article>
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Sezioni</p>
              <p className="mt-1 text-2xl font-semibold">{totalSubprojects}</p>
            </article>
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Keyword</p>
              <p className="mt-1 text-2xl font-semibold">{totalKeywords}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Progetti</h2>
          <Link href="/projects/new" className="btn-primary w-full text-center sm:w-auto">
            Nuovo progetto
          </Link>
        </div>

        <div className="table-shell">
          <table className="table-enterprise min-w-[820px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Sezioni</th>
                <th className="px-3 py-2">Seed</th>
                <th className="px-3 py-2">Keyword</th>
                <th className="px-3 py-2">Aggiornato</th>
                <th className="px-3 py-2">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-3 py-3 font-medium">{project.name}</td>
                  <td className="px-3 py-3">{project._count.subprojects}</td>
                  <td className="px-3 py-3">{project._count.seeds}</td>
                  <td className="px-3 py-3">{project._count.keyword_candidates}</td>
                  <td className="px-3 py-3">{formatDate(project.last_activity_at)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="btn-secondary" href={`/projects/${project.id}`}>
                        Apri
                      </Link>
                      <Link className="btn-secondary" href={resultsHref(project.id, { view: "all" })}>
                        Risultati
                      </Link>
                      <DeleteProjectButton
                        projectId={project.id}
                        projectName={project.name}
                        buttonLabel="Elimina"
                        buttonClassName="btn-danger"
                        redirectTo={null}
                        showInlineError={false}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projects.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">Nessun progetto al momento.</p>}
        </div>

        <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">
            Pagina {page} di {totalPages}
          </p>
          <PaginationLinks
            previousHref={page > 1 ? `/?page=${page - 1}` : null}
            nextHref={page < totalPages ? `/?page=${page + 1}` : null}
          />
        </div>
      </section>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Ultimi job</h2>

        <div className="table-shell">
          <table className="table-enterprise min-w-[680px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">Progetto</th>
                <th className="px-3 py-2">Sezione</th>
                <th className="px-3 py-2">Stato</th>
                <th className="px-3 py-2">Avviato</th>
                <th className="px-3 py-2">Completato</th>
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
                    <span className={`status-chip ${jobStatusTone(job.status)}`}>{job.status}</span>
                  </td>
                  <td className="px-3 py-3">{formatDate(job.started_at)}</td>
                  <td className="px-3 py-3">{formatDate(job.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentJobs.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">Nessun job trovato.</p>}
        </div>
      </section>
    </div>
  );
}


