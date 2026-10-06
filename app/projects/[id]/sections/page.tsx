import Link from "next/link";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { PageHeaderCard } from "@/components/page-header-card";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { SectionOrderButtons } from "@/components/section-order-buttons";
import { SetDefaultSectionButton } from "@/components/set-default-section-button";
import { SubprojectForm } from "@/components/subproject-form";
import { requirePageUser } from "@/lib/auth/page-guard";
import { requireOwnedProject, SECTIONS_WITH_STATS } from "@/lib/modules/project-pages";
import { resultsHref } from "@/lib/modules/results-view";
import { sectionDeleteTarget } from "@/lib/view/delete-targets";
import { jobStatusTone } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function ProjectSectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  const project = await requireOwnedProject(user.id, id, { subprojects: SECTIONS_WITH_STATS });

  return (
    <div className="space-y-6">
      <PageHeaderCard
        title="Gestisci sezioni"
        subtitle={
          <>
            Progetto: <span className="font-medium">{project.name}</span>
          </>
        }
        action={
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}`}>
            Torna al progetto
          </Link>
        }
      />

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
                        <Link className="btn-secondary" href={resultsHref(project.id, { subprojectId: section.id })}>
                          Risultati
                        </Link>
                        <SetDefaultSectionButton
                          projectId={project.id}
                          subprojectId={section.id}
                          isDefault={project.default_subproject_id === section.id}
                        />
                        <RunExtractionButton
                          runPath={`/api/projects/${project.id}/subprojects/${section.id}/run`}
                          label="Esegui"
                          runningLabel="Esecuzione..."
                        />
                        <DeleteEntityButton {...sectionDeleteTarget(project.id, section)} showInlineError={false} />
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