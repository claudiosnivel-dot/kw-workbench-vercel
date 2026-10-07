import type { Prisma } from "@/lib/generated/prisma/client";

/** Progetto di cui registrare l'attività, con il perimetro della scrittura (T-1502). */
export type ActivityTarget = { id: string; perimeter: Prisma.ProjectWhereInput };

/**
 * Registra l'attività reale sul progetto (T-810): estrazioni terminate o fallite, creazione, modifica,
 * eliminazione e riordino delle sezioni, revisione dei risultati e modifica del progetto. Accetta il client
 * o una transazione; updateMany non fallisce se il progetto è stato eliminato nel frattempo. Il where porta il
 * perimetro della scrittura (T-1502): il workspace e la membership dell'utente nelle rotte, il job nel runner.
 */
export async function touchProjectActivity(
  db: Pick<Prisma.TransactionClient, "project">,
  project: ActivityTarget,
  at: Date = new Date()
): Promise<void> {
  await db.project.updateMany({ where: { id: project.id, ...project.perimeter }, data: { last_activity_at: at } });
}

/** Progetto del job nel runner (T-1502): il perimetro è il job stesso, già autorizzato quando è stato avviato. */
export function jobProject(job: { id: string; project_id: string }): ActivityTarget {
  return { id: job.project_id, perimeter: { jobs: { some: { id: job.id } } } };
}
