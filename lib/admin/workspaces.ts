import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Workspace nell'elenco del root admin (T-3403): soli conteggi, nessun dato dei progetti (T-1705). */
export type AdminWorkspaceRecord = {
  id: string;
  name: string;
  personal: boolean;
  /** Primo OWNER per data di ingresso; null solo per un workspace rimasto senza proprietario. */
  owner: { id: string; displayName: string } | null;
  membersCount: number;
  projectCount: number;
  /** planId dell'abbonamento (T-1604), free senza abbonamento. */
  plan: string;
};

const ADMIN_WORKSPACES_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;

/** Ricerca senza distinzione di maiuscole sul nome del workspace o su nome mostrato ed email del proprietario. */
function searchWhere(searchText: string): Prisma.WorkspaceWhereInput {
  if (!searchText) {
    return {};
  }
  const contains = { contains: searchText, mode: "insensitive" } as const;
  return {
    OR: [
      { name: contains },
      { memberships: { some: { role: "OWNER", user: { OR: [{ display_name: contains }, { email: contains }] } } } },
    ],
  };
}

/**
 * Elenco dei workspace della piattaforma per il root admin (T-3403): pagine da 50 dal più recente, con proprietario,
 * numero di membri e di progetti e piano. I filtri entrano come parametri di Prisma, mai come SQL composto (CWE-89).
 */
export async function listAdminWorkspaces(input: {
  searchText?: string | null;
  page?: number;
}): Promise<{ workspaces: AdminWorkspaceRecord[]; page: number; pageSize: number; total: number }> {
  const page = Number.isFinite(input.page) && (input.page as number) >= 1 ? Math.floor(input.page as number) : 1;
  const where = searchWhere(String(input.searchText ?? "").trim().slice(0, MAX_SEARCH_LENGTH));

  const [total, rows] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_WORKSPACES_PAGE_SIZE,
      take: ADMIN_WORKSPACES_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        personal_for_user_id: true,
        memberships: {
          where: { role: "OWNER" },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
          take: 1,
          select: { user: { select: { id: true, display_name: true } } },
        },
        subscription: { select: { plan_id: true } },
        _count: { select: { memberships: true, projects: true } },
      },
    }),
  ]);

  return {
    workspaces: rows.map((row) => {
      const owner = row.memberships[0]?.user;
      return {
        id: row.id,
        name: row.name,
        personal: row.personal_for_user_id !== null,
        owner: owner ? { id: owner.id, displayName: owner.display_name } : null,
        membersCount: row._count.memberships,
        projectCount: row._count.projects,
        plan: row.subscription?.plan_id ?? "free",
      };
    }),
    page,
    pageSize: ADMIN_WORKSPACES_PAGE_SIZE,
    total,
  };
}
