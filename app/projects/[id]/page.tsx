import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteSubprojectButton } from "@/components/delete-subproject-button";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { SubprojectForm } from "@/components/subproject-form";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function jobStatusTone(value: string): string {
  if (value === "completed") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (value === "failed") return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  if (value === "running") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  return "border-slate-500/40 bg-slate-700/25 text-slate-200";
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthenticatedUserFromCookies();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    include: {
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        include: {
          _count: {
            select: {
              seeds: true,
              keyword_candidates: true,
              jobs: true,
            },
          },
          jobs: {
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
      },
      _count: {
        select: {
          seeds: true,
          keyword_candidates: true,
          jobs: true,
          subprojects: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const hasSingleSubproject = project.subprojects.length === 1;

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Progetto padre con {project._count.subprojects} sottoprogetti
            </p>
          </div>

          {hasSingleSubproject ? (
            <RunExtractionButton projectId={project.id} label="Avvia estrazione rapida" runningLabel="Estrazione in corso..." />
          ) : (
            <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Estrazione rapida disattivata: scegli il sottoprogetto da eseguire nella tabella qui sotto.
            </p>
          )}
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-4">
          <p>
            <span className="font-medium">Sottoprogetti:</span> {project._count.subprojects}
          </p>
          <p>
            <span className="font-medium">Seed totali:</span> {project._count.seeds}
          </p>
          <p>
            <span className="font-medium">Keyword totali:</span> {project._count.keyword_candidates}
          </p>
          <p>
            <span className="font-medium">Job totali:</span> {project._count.jobs}
          </p>
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <p>
            <span className="font-medium">Locale default:</span> {project.language_code}-{project.country_code}
          </p>
          <p>
            <span className="font-medium">Autocomplete default:</span> {project.autocomplete_provider}
          </p>
          <p>
            <span className="font-medium">Metriche default:</span> {project.metrics_provider}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/results`}>
            Vedi risultati aggregati
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/settings`}>
            Impostazioni progetto padre
          </Link>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Aggiungi sottoprogetto</h2>
        <SubprojectForm
          mode="create"
          projectId={project.id}
          canEditAutocompleteProvider={user.isRootAdmin}
          showAdvanced={false}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Sottoprogetti</h2>

        <div className="table-shell">
          <table className="table-enterprise min-w-[980px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Seed</th>
                <th className="px-3 py-2">Keyword</th>
                <th className="px-3 py-2">Ultimo job</th>
                <th className="px-3 py-2">Aggiornato</th>
                <th className="px-3 py-2">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {project.subprojects.map((subproject) => {
                const latestJob = subproject.jobs[0] ?? null;

                return (
                  <tr key={subproject.id}>
                    <td className="px-3 py-3 font-medium">{subproject.name}</td>
                    <td className="px-3 py-3">{subproject._count.seeds}</td>
                    <td className="px-3 py-3">{subproject._count.keyword_candidates}</td>
                    <td className="px-3 py-3">
                      {latestJob ? (
                        <span className={`status-chip ${jobStatusTone(latestJob.status)}`}>{latestJob.status}</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{formatDate(subproject.updated_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn-secondary" href={`/projects/${project.id}/subprojects/${subproject.id}`}>
                          Apri
                        </Link>
                        <Link className="btn-secondary" href={`/projects/${project.id}/results?subprojectId=${subproject.id}`}>
                          Risultati
                        </Link>
                        <RunExtractionButton
                          runPath={`/api/projects/${project.id}/subprojects/${subproject.id}/run`}
                          label="Esegui"
                          runningLabel="Esecuzione..."
                        />
                        <DeleteSubprojectButton
                          projectId={project.id}
                          subprojectId={subproject.id}
                          subprojectName={subproject.name}
                          buttonClassName="btn-danger"
                          buttonLabel="Elimina"
                          showInlineError={false}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {project.subprojects.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">Nessun sottoprogetto al momento.</p>}
        </div>
      </section>
    </div>
  );
}
