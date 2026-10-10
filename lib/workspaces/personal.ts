import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";

/**
 * Workspace personale dell'utente con la sua membership OWNER (T-1501), nella transazione che crea l'utente: un errore a
 * metà non lascia utenti senza workspace (CWE-460). Nome = nome mostrato, slug derivato dall'id come nella migrazione.
 */
export async function createPersonalWorkspace(
  tx: Prisma.TransactionClient,
  user: { id: string; display_name: string }
): Promise<{ id: string }> {
  const id = randomUUID();
  return tx.workspace.create({
    data: {
      id,
      name: user.display_name,
      slug: `ws-${id}`,
      personal_for_user_id: user.id,
      memberships: { create: { user_id: user.id, role: WorkspaceRole.OWNER } },
    },
    select: { id: true },
  });
}

// Erede del workspace personale: prima un altro OWNER, poi un ADMIN, poi un MEMBER (T-2006).
const HEIR_PRIORITY: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER];

/**
 * Passaggio del workspace personale di un utente che sta per essere eliminato (T-2006, D-08 emendata), nella transazione
 * dell'eliminazione: con altri membri la proprietà va al membro di ruolo più alto (a parità la membership più vecchia),
 * il workspace si stacca dall'utente e resta con i progetti. null senza altri membri: il workspace va via in cascata
 * con l'utente.
 */
export async function handOverPersonalWorkspace(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<{ workspaceId: string; newOwnerUserId: string } | null> {
  const workspace = await tx.workspace.findUnique({ where: { personal_for_user_id: userId }, select: { id: true } });
  if (!workspace) {
    return null;
  }
  await lockWorkspaceRow(tx, workspace.id);
  const others = await tx.membership.findMany({
    where: { workspace_id: workspace.id, user_id: { not: userId } },
    orderBy: [{ created_at: "asc" }, { user_id: "asc" }],
    select: { user_id: true, role: true },
  });
  const heir = HEIR_PRIORITY.flatMap((role) => others.filter((member) => member.role === role))[0];
  if (!heir) {
    return null;
  }
  if (heir.role !== WorkspaceRole.OWNER) {
    await tx.membership.update({
      where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: heir.user_id } },
      data: { role: WorkspaceRole.OWNER },
    });
  }
  await tx.workspace.update({ where: { id: workspace.id }, data: { personal_for_user_id: null } });
  return { workspaceId: workspace.id, newOwnerUserId: heir.user_id };
}
