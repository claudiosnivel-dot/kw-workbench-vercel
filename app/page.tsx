import Link from "next/link";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
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

export default async function DashboardPage() {
  const user = await requireAuthenticatedUserFromCookies();

  const [projects, recentJobs, totalProjects, totalKeywords] = await Promise.all([
    prisma.project.findMany({
      where: { owner_user_id: user.id },
      orderBy: { updated_at: "desc" },
      include: {
        _count: {
          select: {
            keyword_candidates: true,
            seeds: true,
          },
        },
      },
      take: 20,
    }),
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
      },
      take: 15,
    }),
    prisma.project.count({ where: { owner_user_id: user.id } }),
    prisma.keywordCandidate.count({
      where: {
        project: {
          owner_user_id: user.id,
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Panoramica</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Controlla i tuoi progetti SEO e avvia nuove estrazioni</h1>
            <p className="text-sm text-slate-600 sm:text-base">
              Accedi rapidamente a risultati, job recenti e impostazioni progetto da un unico pannello operativo.
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
              <p className="text-xs uppercase tracking-wide text-slate-500">Keyword</p>
              <p className="mt-1 text-2xl font-semibold">{totalKeywords}</p>
            </article>
            <article className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Job recenti</p>
              <p className="mt-1 text-2xl font-semibold">{recentJobs.length}</p>
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
          <table className="table-enterprise min-w-[720px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Locale</th>
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
                  <td className="px-3 py-3">
                    <span className="status-chip">
                      {project.language_code}-{project.country_code}
                    </span>
                  </td>
                  <td className="px-3 py-3">{project._count.seeds}</td>
                  <td className="px-3 py-3">{project._count.keyword_candidates}</td>
                  <td className="px-3 py-3">{formatDate(project.updated_at)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="btn-secondary" href={`/projects/${project.id}`}>
                        Apri
                      </Link>
                      <Link className="btn-secondary" href={`/projects/${project.id}/results`}>
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
      </section>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Ultimi job</h2>

        <div className="table-shell">
          <table className="table-enterprise min-w-[560px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">Progetto</th>
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