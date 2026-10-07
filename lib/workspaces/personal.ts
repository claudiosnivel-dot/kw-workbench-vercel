import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";

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
