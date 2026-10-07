import { notFound } from "next/navigation";
import { getPageWorkspace, projectAccessWhere } from "@/lib/authz/workspace";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import type { SearchParams } from "@/lib/http/search-params";
import { prisma } from "@/lib/prisma";

/** Props delle pagine di un progetto che leggono anche i parametri di query (T-1102). */
export type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
};

/** Sezioni del progetto in ordine di posizione, con i conteggi e l'ultimo job (pagina del progetto e gestione sezioni). */
export const SECTIONS_WITH_STATS = {
  orderBy: [{ position: "asc" }, { created_at: "asc" }],
  include: {
    _count: { select: { seeds: true, keyword_candidates: true, jobs: true } },
    jobs: { orderBy: { created_at: "desc" }, take: 1 },
  },
} satisfies Prisma.Project$subprojectsArgs;

/**
 * Progetto di un workspace dell'utente con le relazioni richieste (T-1502): notFound() (pagina 404, nessun dato) se non
 * esiste o l'utente non è membro del suo workspace. role è il ruolo dell'utente in quel workspace, per i controlli
 * mostrati (la verifica resta lato server nelle rotte).
 */
export async function requireProjectPage<const I extends Prisma.ProjectInclude>(
  userId: string,
  projectId: string,
  include: I
): Promise<Prisma.ProjectGetPayload<{ include: I }> & { role: WorkspaceRole }> {
  const [project, { workspaces }] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere(userId) }, include }),
    getPageWorkspace(userId),
  ]);
  const role = workspaces.find((workspace) => workspace.id === project?.workspace_id)?.role;
  if (!project || !role) {
    notFound();
  }

  return { ...(project as Prisma.ProjectGetPayload<{ include: I }>), role };
}
