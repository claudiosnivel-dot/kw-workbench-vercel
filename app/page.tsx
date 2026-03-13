import Link from "next/link";
import { AuthSettingsCard } from "@/components/auth-settings-card";
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
      <section className="grid gap-4 md:grid-cols-3">
        <article className="card">
          <p className="text-sm text-slate-500">Progetti</p>
          <p className="mt-1 text-2xl font-semibold">{totalProjects}</p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Parole chiave candidate</p>
          <p className="mt-1 text-2xl font-semibold">{totalKeywords}</p>
        </article>
        <article className="card">
          <p className="text-sm text-slate-500">Job recenti</p>
          <p className="mt-1 text-2xl font-semibold">{recentJobs.length}</p>
        </article>
      </section>

      <AuthSettingsCard
        initial={{
          username: user.username,
        }}
      />

      <section className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Progetti</h2>
          <Link href="/projects/new" className="btn-primary w-full text-center sm:w-auto">
            Crea progetto
          </Link>
        </div>
        <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
          <table className="min-w-[720px] text-left text-sm sm:min-w-full">
            <thead className="text-xs uppercase text-slate-500">
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
                <tr key={project.id} className="border-t border-slate-200">
                  <td className="px-3 py-3 font-medium">{project.name}</td>
                  <td className="px-3 py-3">{project.language_code}-{project.country_code}</td>
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
        <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
          <table className="min-w-[560px] text-left text-sm sm:min-w-full">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Progetto</th>
                <th className="px-3 py-2">Stato</th>
                <th className="px-3 py-2">Avviato</th>
                <th className="px-3 py-2">Completato</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-200">
                  <td className="px-3 py-3">
                    <Link className="font-medium underline" href={`/projects/${job.project.id}`}>
                      {job.project.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 uppercase">{job.status}</td>
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
