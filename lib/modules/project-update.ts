import { expectOneRow, requireProjectAccess } from "@/lib/authz/workspace";
import { assertLicensedMetricsChoice } from "@/lib/billing/enforce";
import { ProjectNotFoundError } from "@/lib/modules/project-access";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { parseProjectPatch } from "@/lib/modules/project-settings";
import { prisma } from "@/lib/prisma";

type ProjectActor = Parameters<typeof parseProjectPatch>[1] & { id: string };

/**
 * PATCH del progetto (T-809, T-1502): membri con project.update; solo i campi inviati, validati da uno schema strict;
 * il provider salvato serve a parseProjectPatch (MOCK e DATAFORSEO restano se c'erano già); la scrittura porta il
 * perimetro del workspace e l'attività è registrata nella stessa transazione.
 */
export async function patchProject(user: ProjectActor, projectId: string, payload: unknown) {
  const project = await requireProjectAccess(user, projectId, "project.update", { metrics_provider: true });
  const data = parseProjectPatch(payload, user, project);
  await assertLicensedMetricsChoice(user, project.workspace_id, data.metrics_provider, project.metrics_provider);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({ where: { id: project.id, ...project.perimeter }, data });
    expectOneRow(count, () => new ProjectNotFoundError());
    await touchProjectActivity(tx, project);
    return tx.project.findUniqueOrThrow({ where: { id: project.id } });
  });
}

/**
 * DELETE del progetto (T-1502): non membro 404 (CWE-639), MEMBER 403 (project.delete è da ADMIN, D-08); la
 * cancellazione porta il perimetro del workspace con il ruolo nel where.
 */
export async function deleteProject(user: { id: string }, projectId: string): Promise<void> {
  const project = await requireProjectAccess(user, projectId, "project.delete", {});
  const { count } = await prisma.project.deleteMany({ where: { id: project.id, ...project.perimeter } });
  expectOneRow(count, () => new ProjectNotFoundError());
}
