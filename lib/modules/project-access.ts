import type { Prisma } from "@/lib/generated/prisma/client";
import { AppError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

/**
 * 404 delle rotte di progetto (T-503, T-1303): withApiErrors lo trasforma nel body { error, code, requestId }, uguale
 * in ogni rotta; mai un 403 che riveli l'esistenza del progetto di un altro utente (CWE-639).
 */
export class ProjectNotFoundError extends AppError {
  constructor() {
    super(404, "PROJECT_NOT_FOUND", "Progetto non trovato");
    this.name = "ProjectNotFoundError";
  }
}

/** 404 delle rotte di sezione (T-503, T-1303). */
export class SectionNotFoundError extends AppError {
  constructor() {
    super(404, "SECTION_NOT_FOUND", "Sezione non trovata");
    this.name = "SectionNotFoundError";
  }
}

/** Progetto dell'utente con i campi di select; ProjectNotFoundError se non esiste o è di un altro utente. */
export async function findOwnedProjectOr404<S extends Prisma.ProjectSelect>(userId: string, projectId: string, select: S) {
  const project = await prisma.project.findFirst({ where: { id: projectId, owner_user_id: userId }, select });
  if (!project) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** Sezione di un progetto dell'utente con i campi di select; SectionNotFoundError se non esiste o non è sua. */
export async function findOwnedSectionOr404<S extends Prisma.SubprojectSelect>(
  userId: string,
  projectId: string,
  sectionId: string,
  select: S
) {
  const section = await prisma.subproject.findFirst({
    where: { id: sectionId, project_id: projectId, project: { owner_user_id: userId } },
    select,
  });
  if (!section) {
    throw new SectionNotFoundError();
  }
  return section;
}

/** Progetto e, se indicata, sezione dell'utente (export, risultati, sezione predefinita): 404 se uno dei due non è suo. */
export async function assertOwnedScope(userId: string, projectId: string, sectionId: string | null): Promise<void> {
  await findOwnedProjectOr404(userId, projectId, { id: true });
  if (sectionId) {
    await findOwnedSectionOr404(userId, projectId, sectionId, { id: true });
  }
}
