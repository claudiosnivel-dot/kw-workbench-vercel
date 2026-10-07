import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Progetti per pagina della dashboard: fisso lato server, non controllabile dal client (CWE-770). */
const DASHBOARD_PAGE_SIZE = 20;

const DASHBOARD_ORDER: Prisma.ProjectOrderByWithRelationInput[] = [{ last_activity_at: "desc" }, { id: "asc" }];

/**
 * Pagina della dashboard (T-810): solo i progetti del workspace attivo (T-1504), la cui membership è già verificata
 * da getPageWorkspace, in ordine di ultima attività. Una page vuota, non numerica o minore di 1 vale 1; oltre l'ultima
 * pagina si ricade sull'ultima.
 */
export async function listDashboardProjects(workspaceId: string, page: string | number | undefined) {
  const where: Prisma.ProjectWhereInput = { workspace_id: workspaceId };
  const parsed = Math.trunc(Number(page));
  const requestedPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  const readPage = (pageNumber: number) =>
    prisma.project.findMany({
      where,
      orderBy: DASHBOARD_ORDER,
      skip: (pageNumber - 1) * DASHBOARD_PAGE_SIZE,
      take: DASHBOARD_PAGE_SIZE,
      include: {
        _count: { select: { subprojects: true, keyword_candidates: true, seeds: true } },
      },
    });

  const [total, requestedItems] = await Promise.all([prisma.project.count({ where }), readPage(requestedPage)]);
  const totalPages = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const items = currentPage === requestedPage ? requestedItems : await readPage(currentPage);

  return { items, total, page: currentPage, totalPages };
}
