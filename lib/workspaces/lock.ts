import { Prisma } from "@/lib/generated/prisma/client";

// SQL statico in frammenti costanti; l'id del workspace è sempre un parametro legato.
const LOCK_WORKSPACE_ROW = Prisma.sql`SELECT "id" FROM "workspaces" WHERE "id" =`;
const FOR_UPDATE = Prisma.sql`FOR UPDATE`;

/**
 * Lock della riga del workspace nella transazione (SELECT ... FOR UPDATE): serializza le scritture che controllano un
 * invariante del workspace (un OWNER, T-1503; limiti del piano, T-1605; stato dell'abbonamento, T-1603), così due
 * richieste concorrenti non lo violano (CWE-362). Restituisce false se il workspace non esiste.
 */
export async function lockWorkspaceRow(tx: Prisma.TransactionClient, workspaceId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`${LOCK_WORKSPACE_ROW} ${workspaceId} ${FOR_UPDATE}`;
  return rows.length > 0;
}
