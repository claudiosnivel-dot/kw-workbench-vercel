import { ProjectShell } from "@/components/project-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { listRecentProjects } from "@/lib/modules/dashboard";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { loadProjectProgress } from "@/lib/modules/project-progress";
import { resolveDefaultSectionId } from "@/lib/modules/results-view";

export const dynamic = "force-dynamic";

/**
 * Struttura di tutte le pagine del progetto (T-2303, D-39): il progetto si risolve nel workspace dell'utente (progetto
 * altrui → 404, T-1502), poi stato del percorso e progetti recenti per la barra laterale, la barra del prossimo passo
 * e il menu dei progetti.
 */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await requireProjectPage(user.id, id, {});
  const [progress, recentProjects] = await Promise.all([loadProjectProgress(project.id), listRecentProjects(project.workspace_id)]);

  return (
    <ProjectShell
      project={{
        id: project.id,
        name: project.name,
        defaultTopicId: resolveDefaultSectionId(
          progress.topics.map((topic, position) => ({ id: topic.id, position })),
          project.default_subproject_id
        ),
      }}
      progress={progress}
      recentProjects={recentProjects}
    >
      {children}
    </ProjectShell>
  );
}
