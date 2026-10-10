import { randomUUID } from "node:crypto";
import { outranksOrEquals } from "@/lib/authz/permissions";
import { requireWorkspaceRole, type WorkspaceSummary } from "@/lib/authz/workspace";
import { isCommercialLive } from "@/lib/billing/launch";
import { Prisma } from "@/lib/generated/prisma/client";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { AppError, ForbiddenError, ValidationError } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { parseAssignableRole } from "@/lib/workspaces/invites";
import { lockWorkspaceRow } from "@/lib/workspaces/lock";
import { createPersonalWorkspace } from "@/lib/workspaces/personal";

const MAX_WORKSPACE_NAME_LENGTH = 80;
/** Limite tecnico dei workspace di squadra creati da un utente con il lancio attivo (T-2008), non configurabile. */
export const MAX_CREATED_WORKSPACES_PER_USER = 10;
// SQL statico in frammenti costanti; l'id dell'utente è sempre un parametro legato.
const LOCK_USER_ROW = Prisma.sql`SELECT "id" FROM "users" WHERE "id" =`;
const FOR_UPDATE = Prisma.sql`FOR UPDATE`;
// Caratteri di controllo: il nome finisce nelle email di invito e nel selettore.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

class LastOwnerError extends AppError {
  constructor() {
    super(409, "LAST_OWNER", "Il workspace deve avere un proprietario");
    this.name = "LastOwnerError";
  }
}

class MemberNotFoundError extends AppError {
  constructor() {
    super(404, "MEMBER_NOT_FOUND", "Membro non trovato");
    this.name = "MemberNotFoundError";
  }
}

type MembershipChange = { workspace: WorkspaceSummary; targetUserId: string };

/**
 * Modifica di una membership con l'invariante «un OWNER per workspace» (T-1503): lock della riga del workspace
 * (SELECT ... FOR UPDATE), lettura del bersaglio e degli OWNER, controllo e scrittura nella stessa transazione, così due
 * richieste concorrenti non lasciano il workspace senza OWNER (CWE-362). Il creatore del workspace personale non ne viene
 * rimosso; ne esce solo se c'è un altro OWNER (T-2007).
 */
async function withLockedMembership<T>(
  { workspace, targetUserId }: MembershipChange,
  change: (
    tx: Prisma.TransactionClient,
    target: { role: WorkspaceRole; isPersonalOwner: boolean; otherOwners: number }
  ) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceRow(tx, workspace.id);
    const target = await tx.membership.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: targetUserId } },
      select: { role: true, workspace: { select: { personal_for_user_id: true } } },
    });
    if (!target) {
      throw new MemberNotFoundError();
    }
    const otherOwners = await tx.membership.count({
      where: { workspace_id: workspace.id, role: WorkspaceRole.OWNER, user_id: { not: targetUserId } },
    });
    return change(tx, {
      role: target.role,
      isPersonalOwner: target.workspace.personal_for_user_id === targetUserId,
      otherOwners,
    });
  });
}

/** Un OWNER che perde il ruolo o la membership non può essere l'ultimo. */
function assertOwnerRemains(target: { role: WorkspaceRole; otherOwners: number }): void {
  if (target.role === WorkspaceRole.OWNER && target.otherOwners === 0) {
    throw new LastOwnerError();
  }
}

function deleteMembership(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
  return tx.membership.delete({ where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } } });
}

/**
 * Cambio di ruolo (T-1503): ADMIN o superiore; ruolo nuovo ADMIN o MEMBER (la proprietà passa solo con il
 * trasferimento); un ADMIN non modifica un OWNER (403); l'ultimo OWNER non si declassa (409 LAST_OWNER).
 */
export async function changeMemberRole(actor: { id: string }, workspaceId: unknown, userId: string, input: { role?: unknown }) {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "members.manage");
  const role = parseAssignableRole(input.role);

  return withLockedMembership({ workspace, targetUserId: userId }, async (tx, target) => {
    if (!outranksOrEquals(workspace.role, target.role)) {
      throw new ForbiddenError();
    }
    assertOwnerRemains(target);
    await tx.membership.update({
      where: { workspace_id_user_id: { workspace_id: workspace.id, user_id: userId } },
      data: { role },
    });
    return { userId, role };
  });
}

/**
 * Rimozione di un membro (T-1503): ADMIN o superiore; un ADMIN non rimuove un OWNER (403); né l'ultimo OWNER né il
 * proprietario del workspace personale si rimuovono (409 LAST_OWNER).
 */
export async function removeMember(actor: { id: string }, workspaceId: unknown, userId: string) {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "members.manage");

  await withLockedMembership({ workspace, targetUserId: userId }, async (tx, target) => {
    if (!outranksOrEquals(workspace.role, target.role)) {
      throw new ForbiddenError();
    }
    if (target.isPersonalOwner) {
      throw new LastOwnerError();
    }
    assertOwnerRemains(target);
    await deleteMembership(tx, workspace.id, userId);
  });
  logger.info("workspace_member_removed", { workspaceId: workspace.id, userId });
}

/**
 * Abbandono del workspace (T-1503): ogni membro, mai l'ultimo OWNER (409 LAST_OWNER). Il creatore del workspace personale
 * ne esce solo se un altro membro ne è OWNER (T-2007, D-08 emendata): nella stessa transazione il workspace si stacca da
 * lui e diventa di squadra, e l'utente riceve un nuovo workspace personale vuoto (uno e uno solo per utente).
 */
export async function leaveWorkspace(user: { id: string; displayName: string }, workspaceId: unknown) {
  const workspace = await requireWorkspaceRole(user, workspaceId, "workspace.read");

  await withLockedMembership({ workspace, targetUserId: user.id }, async (tx, target) => {
    if (target.isPersonalOwner && target.otherOwners === 0) {
      throw new LastOwnerError();
    }
    assertOwnerRemains(target);
    await deleteMembership(tx, workspace.id, user.id);
    if (target.isPersonalOwner) {
      await tx.workspace.update({ where: { id: workspace.id }, data: { personal_for_user_id: null } });
      await createPersonalWorkspace(tx, { id: user.id, display_name: user.displayName });
    }
  });
  logger.info("workspace_member_left", { workspaceId: workspace.id, userId: user.id });
}

/**
 * Trasferimento della proprietà (T-1503): solo l'OWNER; il destinatario, già membro, diventa OWNER e il cedente ADMIN
 * nella stessa transazione, così il workspace ha sempre esattamente un OWNER.
 */
export async function transferOwnership(actor: { id: string }, workspaceId: unknown, input: { userId?: unknown }) {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "workspace.transfer");
  const targetUserId = typeof input.userId === "string" ? input.userId : "";
  if (!targetUserId || targetUserId === actor.id) {
    throw new ValidationError("Destinatario del trasferimento non valido");
  }

  await withLockedMembership({ workspace, targetUserId }, async (tx) => {
    const key = (userId: string) => ({ workspace_id_user_id: { workspace_id: workspace.id, user_id: userId } });
    await tx.membership.update({ where: key(targetUserId), data: { role: WorkspaceRole.OWNER } });
    await tx.membership.update({ where: key(actor.id), data: { role: WorkspaceRole.ADMIN } });
  });
  logger.info("workspace_ownership_transferred", { workspaceId: workspace.id, from: actor.id, to: targetUserId });
  return { ownerUserId: targetUserId };
}

/** Nome del workspace (T-1504): da 1 a 80 caratteri senza spazi ai bordi, nessun carattere di controllo. */
function validateWorkspaceName(input: unknown): string {
  const name = String(input ?? "").trim();
  if (name.length < 1 || name.length > MAX_WORKSPACE_NAME_LENGTH || CONTROL_CHARACTERS.test(name)) {
    throw new ValidationError(`Nome non valido: usa da 1 a ${MAX_WORKSPACE_NAME_LENGTH} caratteri`);
  }
  return name;
}

/**
 * Nuovo workspace di squadra (T-2008, D-08 emendata): nome da 1 a 80 caratteri, slug univoco derivato dall'id, il creatore
 * è OWNER e autore (created_by_user_id). Con il lancio attivo un utente ne crea al massimo
 * MAX_CREATED_WORKSPACES_PER_USER tra quelli ancora esistenti (409 WORKSPACE_LIMIT): il lock della riga dell'utente
 * serializza due creazioni concorrenti (CWE-362). Con il lancio in pausa nessun limite (D-32).
 */
export async function createTeamWorkspace(actor: { id: string }, input: { name?: unknown }) {
  const name = validateWorkspaceName(input.name);
  const limited = await isCommercialLive();
  const id = randomUUID();
  return prisma.$transaction(async (tx) => {
    if (limited) {
      await tx.$queryRaw`${LOCK_USER_ROW} ${actor.id} ${FOR_UPDATE}`;
      if ((await tx.workspace.count({ where: { created_by_user_id: actor.id } })) >= MAX_CREATED_WORKSPACES_PER_USER) {
        throw new AppError(409, "WORKSPACE_LIMIT", "Numero massimo di workspace creati raggiunto");
      }
    }
    return tx.workspace.create({
      data: {
        id,
        name,
        slug: `ws-${id}`,
        created_by_user_id: actor.id,
        memberships: { create: { user_id: actor.id, role: WorkspaceRole.OWNER } },
      },
      select: { id: true, name: true },
    });
  });
}

/** Rinomina del workspace (T-1504): ADMIN o superiore (workspace.update). */
export async function renameWorkspace(actor: { id: string }, workspaceId: unknown, input: { name?: unknown }) {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "workspace.update");
  const name = validateWorkspaceName(input.name);
  const updated = await prisma.workspace.update({ where: { id: workspace.id }, data: { name }, select: { id: true, name: true } });
  return updated;
}

/** Membri del workspace con ruolo e data di ingresso, per la pagina /workspace (T-1504). */
export function listMembers(workspaceId: string) {
  return prisma.membership.findMany({
    where: { workspace_id: workspaceId },
    orderBy: [{ created_at: "asc" }, { user_id: "asc" }],
    select: { role: true, created_at: true, user: { select: { id: true, display_name: true, email: true } } },
  });
}
