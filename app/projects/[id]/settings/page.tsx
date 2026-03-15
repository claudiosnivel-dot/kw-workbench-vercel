import Link from "next/link";
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
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: {
          id: true,
          name: true,
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
        <h1 className="text-2xl font-semibold">Impostazioni progetto</h1>
        <p className="text-sm text-slate-600">
          Qui imposti i default del contenitore. Ogni sezione puo ereditare questi valori o usare override dedicati.
        </p>
        <ProjectForm
          mode="edit"
          projectId={project.id}
          canEditAutocompleteProvider={user.isRootAdmin}
          showSeeds={false}
          showInitialSubprojectName={false}
          initialValues={{
            name: project.name,
            language_code: project.language_code,
            country_code: project.country_code,
            initial_subproject_name: "Generale",
            seeds: "",
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

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">Sezioni collegate</h2>
        <div className="flex flex-wrap gap-2">
          {project.subprojects.map((subproject) => (
            <Link key={subproject.id} className="btn-secondary" href={`/projects/${project.id}/subprojects/${subproject.id}`}>
              {subproject.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold text-red-700">Zona pericolosa</h2>
        <p className="mb-4 text-sm text-slate-600">
          Eliminando questo progetto verranno rimosse sezioni, seed, keyword candidate e job collegati.
        </p>
        <DeleteProjectButton projectId={project.id} projectName={project.name} />
      </section>
    </div>
  );
}


