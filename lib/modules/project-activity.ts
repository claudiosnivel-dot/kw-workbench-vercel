import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Registra l'attività reale sul progetto (T-810): estrazioni terminate o fallite, creazione, modifica,
 * eliminazione e riordino delle sezioni, revisione dei risultati e modifica del progetto. Accetta il client
 * o una transazione; updateMany non fallisce se il progetto è stato eliminato nel frattempo.
 */
export async function touchProjectActivity(
  db: Pick<Prisma.TransactionClient, "project">,
  projectId: string,
  at: Date = new Date()
): Promise<void> {
  await db.project.updateMany({ where: { id: projectId }, data: { last_activity_at: at } });
}
