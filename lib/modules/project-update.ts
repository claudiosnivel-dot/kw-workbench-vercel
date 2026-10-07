import { findOwnedProjectOr404 } from "@/lib/modules/project-access";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseProjectPatch } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

type ProjectActor = Parameters<typeof parseProjectPatch>[1] & { id: string };

/**
 * PATCH del progetto dell'utente (T-809): solo i campi inviati, validati da uno schema strict; il provider salvato
 * serve a parseProjectPatch (MOCK e DATAFORSEO restano se c'erano già); attività registrata nella stessa transazione.
 */
export async function patchOwnedProject(user: ProjectActor, projectId: string, payload: unknown) {
  const project = await findOwnedProjectOr404(user.id, projectId, { metrics_provider: true });
  const data = parseProjectPatch(payload, user, project);
  return prisma.$transaction(async (tx) => {
    const result = await tx.project.update({ where: { id: projectId }, data });
    await touchProjectActivity(tx, projectId);
    return result;
  });
}

/** DELETE del progetto dell'utente: 404 se non è suo (CWE-639). */
export async function deleteOwnedProject(userId: string, projectId: string): Promise<void> {
  await findOwnedProjectOr404(userId, projectId, { id: true });
  await prisma.project.delete({ where: { id: projectId } });
}
