import { ProjectShell } from "@/components/project-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { getGoogleSheetsCredentialSnapshot } from "@/lib/integrations/google-sheets";
import { listRecentProjects } from "@/lib/modules/dashboard";
import { requireProjectPage } from "@/lib/modules/project-pages";
import { loadProjectProgress } from "@/lib/modules/project-progress";

export const dynamic = "force-dynamic";

/**
 * Struttura di tutte le pagine del progetto (T-2303, D-39): il progetto si risolve nel workspace dell'utente (progetto
 * altrui → 404, T-1502), poi stato del percorso e progetti recenti per la barra laterale, la barra del prossimo passo
 * e il menu dei progetti, più collegamento a Google Sheets e logo del branding per la finestra Esporta (T-2406).
 */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const project = await requireProjectPage(user.id, id, {});
  const [progress, recentProjects, googleSheets, branding] = await Promise.all([
    loadProjectProgress(project.id),
    listRecentProjects(project.workspace_id),
    getGoogleSheetsCredentialSnapshot(user.id),
    getBrandingSnapshot(),
  ]);

  return (
    <ProjectShell
      project={{ id: project.id, name: project.name }}
      progress={progress}
      recentProjects={recentProjects}
      exportOptions={{ sheetsConnected: googleSheets.connected, hasLogo: branding.logoUrl.length > 0 }}
    >
      {children}
    </ProjectShell>
  );
}
