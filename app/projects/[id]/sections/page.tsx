import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteSubprojectButton } from "@/components/delete-subproject-button";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { SectionOrderButtons } from "@/components/section-order-buttons";
import { SubprojectForm } from "@/components/subproject-form";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function jobStatusTone(value: string): string {
  if (value === "completed") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
  if (value === "failed") return "border-rose-400/40 bg-rose-500/15 text-rose-200";
  if (value === "running") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  return "border-slate-500/40 bg-slate-700/25 text-slate-200";
}

export default async function ProjectSectionsPage({ params }: { params: Promise<{ id: string }> }) {
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
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Gestisci sezioni</h1>
            <p className="mt-1 text-sm text-slate-600">
              Progetto: <span className="font-medium">{project.name}</span>
            </p>
          </div>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}`}>
            Torna al progetto
          </Link>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold">Aggiungi nuova sezione</h2>
        <SubprojectForm mode="create" projectId={project.id} canEditAutocompleteProvider={user.isRootAdmin} showAdvanced={false} />
      </section>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Elenco sezioni</h2>
        <div className="table-shell">
          <table className="table-enterprise min-w-[980px] text-left text-sm sm:min-w-full">
            <thead>
              <tr>
                <th className="px-3 py-2">Ordine</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Seed</th>
                <th className="px-3 py-2">Keyword</th>
                <th className="px-3 py-2">Ultimo job</th>
                <th className="px-3 py-2">Azioni</th>
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
                        disableUp={index === 0}
                        disableDown={index === project.subprojects.length - 1}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium">{section.name}</td>
                    <td className="px-3 py-3">{section._count.seeds}</td>
                    <td className="px-3 py-3">{section._count.keyword_candidates}</td>
                    <td className="px-3 py-3">
                      {latestJob ? (
                        <span className={`status-chip ${jobStatusTone(latestJob.status)}`}>{latestJob.status}</span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link className="btn-secondary" href={`/projects/${project.id}/subprojects/${section.id}`}>
                          Rinomina / impostazioni
                        </Link>
                        <Link className="btn-secondary" href={`/projects/${project.id}/results?subprojectId=${section.id}`}>
                          Risultati
                        </Link>
                        <RunExtractionButton
                          runPath={`/api/projects/${project.id}/subprojects/${section.id}/run`}
                          label="Esegui"
                          runningLabel="Esecuzione..."
                        />
                        <DeleteSubprojectButton
                          projectId={project.id}
                          subprojectId={section.id}
                          subprojectName={section.name}
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
          {project.subprojects.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">Nessuna sezione al momento.</p>}
        </div>
      </section>
    </div>
  );
}