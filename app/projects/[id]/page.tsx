import Link from "next/link";
import { notFound } from "next/navigation";
import { RunExtractionButton } from "@/components/run-extraction-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(value);
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      seeds: { orderBy: { created_at: "asc" } },
      jobs: { orderBy: { created_at: "desc" }, take: 20 },
      _count: {
        select: {
          keyword_candidates: true,
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
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-sm text-slate-600">
              Locale: {project.language_code}-{project.country_code}
            </p>
          </div>
          <RunExtractionButton projectId={project.id} />
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-3">
          <p>
            <span className="font-medium">Provider autocomplete:</span> {project.autocomplete_provider}
          </p>
          <p>
            <span className="font-medium">Provider metriche:</span> {project.metrics_provider}
          </p>
          <p>
            <span className="font-medium">Candidate:</span> {project._count.keyword_candidates}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/results`}>
            Vedi risultati
          </Link>
          <Link className="btn-secondary w-full text-center sm:w-auto" href={`/projects/${project.id}/settings`}>
            Impostazioni progetto
          </Link>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Keyword seed</h2>
          <div className="rounded-xl bg-slate-50 p-3 text-sm break-words">
            {project.seeds.map((seed) => seed.keyword).join(", ") || "Nessuna seed configurata"}
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Stato job</h2>
        <div className="-mx-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
          <table className="min-w-[760px] text-left text-sm sm:min-w-full">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Stato</th>
                <th className="px-3 py-2">Creato</th>
                <th className="px-3 py-2">Avviato</th>
                <th className="px-3 py-2">Completato</th>
                <th className="px-3 py-2">Esito</th>
              </tr>
            </thead>
            <tbody>
              {project.jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-200">
                  <td className="px-3 py-3 uppercase">{job.status}</td>
                  <td className="px-3 py-3">{formatDate(job.created_at)}</td>
                  <td className="px-3 py-3">{formatDate(job.started_at)}</td>
                  <td className="px-3 py-3">{formatDate(job.completed_at)}</td>
                  <td className="px-3 py-3 text-xs break-words max-w-[20rem]">{job.result ? JSON.stringify(job.result) : job.error_message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {project.jobs.length === 0 && <p className="px-3 py-6 text-sm text-slate-500">Nessun job al momento.</p>}
        </div>
      </section>
    </div>
  );
}
