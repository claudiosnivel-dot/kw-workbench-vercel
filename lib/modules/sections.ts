import { Prisma } from "@/lib/generated/prisma/client";
import { AppError } from "@/lib/http/errors";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { prisma } from "@/lib/prisma";

/** Nome di sezione già usato nel progetto (vincolo project_id + name): 409 con codice stabile (T-808). */
class SectionNameTakenError extends AppError {
  constructor() {
    super(409, "SECTION_NAME_TAKEN", "Esiste già una sezione con questo nome");
    this.name = "SectionNameTakenError";
  }
}

/** P2002 su una scrittura di sezione -> SectionNameTakenError, senza nome del vincolo né messaggio Prisma (CWE-209). */
export async function guardSectionName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SectionNameTakenError();
    }
    throw error;
  }
}

/** Sezioni del progetto nell'ordine di visualizzazione, con la position salvata. */
function orderedSections(tx: Prisma.TransactionClient, projectId: string) {
  return tx.subproject.findMany({
    where: { project_id: projectId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }],
    select: { id: true, position: true },
  });
}

/** Riporta le position a 0..n-1 nell'ordine dato, aggiornando solo le sezioni fuori posto. */
async function renumber(tx: Prisma.TransactionClient, projectId: string, ordered: { id: string; position: number }[]) {
  for (const [position, section] of ordered.entries()) {
    if (section.position !== position) {
      await tx.subproject.update({ where: { id: section.id, project_id: projectId }, data: { position } });
    }
  }
}

/**
 * Sposta la sezione di un posto scambiando la position con l'adiacente: 2 update nella stessa transazione,
 * dopo aver normalizzato le position se non sono 0..n-1 univoche. Gli update filtrano anche per project_id.
 */
export async function moveSection(
  projectId: string,
  subprojectId: string,
  direction: "up" | "down"
): Promise<"moved" | "edge" | "not-found"> {
  return prisma.$transaction(async (tx) => {
    const ordered = await orderedSections(tx, projectId);
    const index = ordered.findIndex((section) => section.id === subprojectId);
    if (index < 0) {
      return "not-found";
    }

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) {
      return "edge";
    }

    await renumber(tx, projectId, ordered);
    await tx.subproject.update({ where: { id: ordered[index].id, project_id: projectId }, data: { position: target } });
    await tx.subproject.update({ where: { id: ordered[target].id, project_id: projectId }, data: { position: index } });
    await touchProjectActivity(tx, projectId);
    return "moved";
  });
}

// SQL statico in frammenti costanti; l'id del progetto è sempre un parametro legato.
const LOCK_PROJECT_ROW = Prisma.sql`SELECT "id" FROM "projects" WHERE "id" =`;
const FOR_UPDATE = Prisma.sql`FOR UPDATE`;

/**
 * Elimina la sezione mantenendo l'invariante «almeno una sezione»: lock della riga del progetto, conteggio,
 * eliminazione e rinumerazione nella stessa transazione, così due DELETE concorrenti non lasciano il
 * progetto senza sezioni (CWE-362). La sezione predefinita eliminata passa alla prima rimasta.
 */
export async function deleteSection(projectId: string, subprojectId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`${LOCK_PROJECT_ROW} ${projectId} ${FOR_UPDATE}`;

    const count = await tx.subproject.count({ where: { project_id: projectId } });
    if (count <= 1) {
      throw new AppError(
        400,
        "LAST_SECTION",
        "Non puoi eliminare l'ultima sezione. Ogni progetto deve avere almeno una sezione."
      );
    }

    const project = await tx.project.findUnique({ where: { id: projectId }, select: { default_subproject_id: true } });
    await tx.subproject.delete({ where: { id: subprojectId, project_id: projectId } });

    const remaining = await orderedSections(tx, projectId);
    await renumber(tx, projectId, remaining);

    if (project?.default_subproject_id === subprojectId) {
      await tx.project.update({ where: { id: projectId }, data: { default_subproject_id: remaining[0]?.id ?? null } });
    }
    await touchProjectActivity(tx, projectId);
  });
}
