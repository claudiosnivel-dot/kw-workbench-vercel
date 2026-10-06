import { notFound } from "next/navigation";
import type { Prisma } from "@/lib/generated/prisma/client";
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

/** Progetto dell'utente con le relazioni richieste; notFound() se non esiste o appartiene ad altri. */
export async function requireOwnedProject<const I extends Prisma.ProjectInclude>(
  userId: string,
  projectId: string,
  include: I
): Promise<Prisma.ProjectGetPayload<{ include: I }>> {
  const project = await prisma.project.findFirst({ where: { id: projectId, owner_user_id: userId }, include });
  if (!project) {
    notFound();
  }

  return project as Prisma.ProjectGetPayload<{ include: I }>;
}
