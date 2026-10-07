import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { cache } from "react";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { canPerform, rolesFor, type WorkspaceAction } from "@/lib/authz/permissions";
import { AppError, ForbiddenError } from "@/lib/http/errors";
import { ProjectNotFoundError, SectionNotFoundError } from "@/lib/modules/project-access";
import { prisma } from "@/lib/prisma";

/** Cookie del workspace attivo (T-1504): solo una preferenza, la membership si riverifica a ogni richiesta (CWE-565). */
export const WORKSPACE_COOKIE_NAME = "kwb_workspace";

const WORKSPACE_COOKIE_MAX_AGE_SECONDS = 31_536_000;

// Id dei workspace: uuid (migrazione 0032 e app) o cuid. Un valore diverso nel cookie è malformato e non va al DB.
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

type Actor = { id: string };

/** 404 dei workspace: non membro o inesistente, stessa risposta (CWE-203). */
export class WorkspaceNotFoundError extends AppError {
  constructor() {
    super(404, "WORKSPACE_NOT_FOUND", "Workspace non trovato");
    this.name = "WorkspaceNotFoundError";
  }
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
  isPersonal: boolean;
};

/**
 * Filtro dei progetti raggiungibili dall'utente (T-1501): membro del workspace del progetto. Con un'azione anche il
 * ruolo minimo della tabella dei permessi (T-1502): nel where di update e delete, una membership revocata o un ruolo
 * abbassato tra controllo e scrittura non porta a una scrittura (CWE-367).
 */
export function projectAccessWhere(userId: string, action?: WorkspaceAction): Prisma.ProjectWhereInput {
  return {
    workspace: { memberships: { some: { user_id: userId, ...(action ? { role: { in: rolesFor(action) } } : {}) } } },
  };
}

/**
 * Perimetro delle scritture su un progetto già autorizzato (T-1502): workspace del progetto e membership dell'utente
 * con il ruolo dell'azione, da mettere nel where di ogni update e delete (sul progetto, o come filtro project delle righe
 * figlie). Una membership revocata o un ruolo abbassato dopo il controllo porta a 0 righe, mai a una scrittura (CWE-367).
 */
export type ProjectPerimeter = Prisma.ProjectWhereInput;

/** Progetto autorizzato per un'azione: id, workspace, ruolo dell'utente e perimetro delle scritture. */
export type AuthorizedProject = { id: string; workspace_id: string; role: WorkspaceRole; perimeter: ProjectPerimeter };

function perimeterOf(userId: string, workspaceId: string, action: WorkspaceAction): ProjectPerimeter {
  return { workspace_id: workspaceId, ...projectAccessWhere(userId, action) };
}

/** Ruolo dell'utente nel workspace, o 403 FORBIDDEN se non basta per l'azione. */
function assertRole(role: WorkspaceRole, action: WorkspaceAction): WorkspaceRole {
  if (!canPerform(role, action)) {
    throw new ForbiddenError();
  }
  return role;
}

/** Select della sola membership dell'utente nel workspace della risorsa: il suo ruolo arriva con la stessa query. */
const membershipRoleOf = (userId: string) =>
  ({ memberships: { where: { user_id: userId }, select: { role: true } } }) satisfies Prisma.WorkspaceSelect;

/**
 * Progetto e ruolo dell'utente in UNA query (T-1502): id e membership nello stesso where. Non membro o progetto
 * inesistente → 404 PROJECT_NOT_FOUND, identico (CWE-203, CWE-639); membro senza il ruolo dell'azione → 403 FORBIDDEN.
 */
export async function requireProjectAccess<S extends Omit<Prisma.ProjectSelect, "workspace">>(
  user: Actor,
  projectId: string,
  action: WorkspaceAction,
  select: S
): Promise<Prisma.ProjectGetPayload<{ select: S }> & AuthorizedProject> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, ...projectAccessWhere(user.id) },
    select: { ...select, id: true, workspace_id: true, workspace: { select: membershipRoleOf(user.id) } },
  });
  if (!row) {
    throw new ProjectNotFoundError();
  }

  const { workspace, ...project } = row as typeof row & { workspace: { memberships: { role: WorkspaceRole }[] } };
  const fields = project as unknown as Prisma.ProjectGetPayload<{ select: S }> & { id: string; workspace_id: string };
  return {
    ...fields,
    role: assertRole(workspace.memberships[0].role, action),
    perimeter: perimeterOf(user.id, fields.workspace_id, action),
  };
}

/**
 * Sezione di un progetto raggiungibile e ruolo dell'utente in UNA query (T-1502): non membro, sezione inesistente o di
 * un altro progetto → 404 SECTION_NOT_FOUND; ruolo insufficiente → 403 FORBIDDEN.
 */
export async function requireSectionAccess<S extends Omit<Prisma.SubprojectSelect, "project">>(
  user: Actor,
  projectId: string,
  sectionId: string,
  action: WorkspaceAction,
  select: S
): Promise<Prisma.SubprojectGetPayload<{ select: S }> & { project: AuthorizedProject }> {
  const row = await prisma.subproject.findFirst({
    where: { id: sectionId, project_id: projectId, project: projectAccessWhere(user.id) },
    select: {
      ...select,
      project: { select: { id: true, workspace_id: true, workspace: { select: membershipRoleOf(user.id) } } },
    },
  });
  if (!row) {
    throw new SectionNotFoundError();
  }

  const { project, ...section } = row as typeof row & {
    project: { id: string; workspace_id: string; workspace: { memberships: { role: WorkspaceRole }[] } };
  };
  return {
    ...(section as unknown as Prisma.SubprojectGetPayload<{ select: S }>),
    project: {
      id: project.id,
      workspace_id: project.workspace_id,
      role: assertRole(project.workspace.memberships[0].role, action),
      perimeter: perimeterOf(user.id, project.workspace_id, action),
    },
  };
}

/** Progetto e, se indicata, sezione raggiungibili per l'azione (export, risultati, sezione predefinita): 404 o 403. */
export async function requireProjectScope(
  user: Actor,
  projectId: string,
  sectionId: string | null,
  action: WorkspaceAction
): Promise<AuthorizedProject> {
  const project = await requireProjectAccess(user, projectId, action, {});
  if (sectionId && !(await prisma.subproject.count({ where: { id: sectionId, project_id: project.id } }))) {
    throw new SectionNotFoundError();
  }
  return project;
}

/**
 * Membership dell'utente nel workspace (T-1502): non membro o workspace inesistente → 404 WORKSPACE_NOT_FOUND; ruolo
 * insufficiente per l'azione → 403 FORBIDDEN.
 */
export async function requireWorkspaceRole(
  user: Actor,
  workspaceId: unknown,
  action: WorkspaceAction
): Promise<WorkspaceSummary> {
  if (typeof workspaceId !== "string" || !WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new WorkspaceNotFoundError();
  }

  const membership = await prisma.membership.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: user.id } },
    select: { role: true, workspace: { select: { id: true, name: true, personal_for_user_id: true } } },
  });
  if (!membership) {
    throw new WorkspaceNotFoundError();
  }

  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: assertRole(membership.role, action),
    isPersonal: membership.workspace.personal_for_user_id === user.id,
  };
}

/**
 * Scrittura con il perimetro nel where (T-1502): updateMany e deleteMany devono toccare esattamente una riga, altrimenti
 * la risorsa non è (più) raggiungibile e la risposta è il 404 della risorsa, senza scritture (CWE-367).
 */
export function expectOneRow(count: number, notFound: () => AppError): void {
  if (count !== 1) {
    throw notFound();
  }
}

/** Workspace dell'utente con il suo ruolo: prima quello personale, poi gli altri per nome. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { user_id: userId },
    select: { role: true, workspace: { select: { id: true, name: true, personal_for_user_id: true } } },
    orderBy: [{ workspace: { name: "asc" } }, { workspace_id: "asc" }],
  });

  return memberships
    .map(({ role, workspace }) => ({
      id: workspace.id,
      name: workspace.name,
      role,
      isPersonal: workspace.personal_for_user_id === userId,
    }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal));
}

export type CurrentWorkspace = {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  /** true se il workspace richiesto (cookie) era assente, malformato o non più accessibile: il cookie va riscritto. */
  fallback: boolean;
};

/**
 * Workspace attivo (T-1502, T-1504): quello richiesto se l'utente ne è membro, altrimenti il workspace personale. Una
 * sola query, che restituisce anche l'elenco per il selettore.
 */
export async function getCurrentWorkspace(user: Actor, requestedId?: string | null): Promise<CurrentWorkspace> {
  const workspaces = await listUserWorkspaces(user.id);
  const requested =
    typeof requestedId === "string" && WORKSPACE_ID_PATTERN.test(requestedId)
      ? workspaces.find((workspace) => workspace.id === requestedId)
      : undefined;
  const workspace = requested ?? workspaces.find((item) => item.isPersonal);
  if (!workspace) {
    throw new Error(`Workspace personale mancante per l'utente ${user.id}`);
  }
  return { workspace, workspaces, fallback: !requested };
}

type CookieRequest = { cookies: { get(name: string): { value: string } | undefined } };

/** Workspace attivo di una rotta API: cookie kwb_workspace della richiesta, riverificato. */
export function getRequestWorkspace(user: Actor, request: CookieRequest): Promise<CurrentWorkspace> {
  return getCurrentWorkspace(user, request.cookies.get(WORKSPACE_COOKIE_NAME)?.value ?? null);
}

/** Workspace attivo della richiesta con il ruolo minimo dell'azione (403 FORBIDDEN se non basta). */
export async function requireRequestWorkspace(
  user: Actor,
  request: CookieRequest,
  action: WorkspaceAction
): Promise<WorkspaceSummary> {
  const { workspace } = await getRequestWorkspace(user, request);
  assertRole(workspace.role, action);
  return workspace;
}

/**
 * Workspace attivo delle pagine (T-1504): cookie kwb_workspace riverificato, una sola query per richiesta anche se lo
 * chiedono il layout e la pagina (cache di React).
 */
export const getPageWorkspace = cache(async (userId: string): Promise<CurrentWorkspace> => {
  const requested = (await cookies()).get(WORKSPACE_COOKIE_NAME)?.value ?? null;
  return getCurrentWorkspace({ id: userId }, requested);
});

/**
 * Scrive il cookie del workspace attivo (T-1504): httpOnly, SameSite=Lax, Secure come il cookie di sessione, path /.
 * Contiene solo l'id: è una preferenza, la membership si riverifica a ogni richiesta.
 */
export function setWorkspaceCookie(response: NextResponse, workspaceId: string): void {
  response.cookies.set({
    name: WORKSPACE_COOKIE_NAME,
    value: workspaceId,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  });
}
