import { notFound } from "next/navigation";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ProjectForm } from "@/components/project-form";
import { requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuthenticatedUserFromCookies();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    include: {
      seeds: { orderBy: { created_at: "asc" } },
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h1 className="text-2xl font-semibold">Impostazioni progetto</h1>
        <ProjectForm
          mode="edit"
          projectId={project.id}
          initialValues={{
            name: project.name,
            language_code: project.language_code,
            country_code: project.country_code,
            seeds: project.seeds.map((seed) => seed.keyword).join("\n"),
            autocomplete_provider: project.autocomplete_provider,
            metrics_provider: project.metrics_provider,
            min_volume: project.min_volume,
            exclude_brands: project.exclude_brands,
            expand_alpha: project.expand_alpha,
            expand_numeric: project.expand_numeric,
            expand_patterns: project.expand_patterns,
            auto_classification: project.auto_classification,
            scoring_profile: project.scoring_profile,
          }}
        />
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold text-red-700">Zona pericolosa</h2>
        <p className="mb-4 text-sm text-slate-600">
          Eliminando questo progetto verranno rimossi impostazioni, seed, keyword candidate e job collegati.
        </p>
        <DeleteProjectButton projectId={project.id} projectName={project.name} />
      </section>
    </div>
  );
}
