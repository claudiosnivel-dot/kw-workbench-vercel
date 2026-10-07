import { outranksOrEquals } from "@/lib/authz/permissions";
import { requireWorkspaceRole, type WorkspaceSummary } from "@/lib/authz/workspace";
import { Prisma } from "@/lib/generated/prisma/client";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { AppError, ForbiddenError, ValidationError } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { parseAssignableRole } from "@/lib/workspaces/invites";

const MAX_WORKSPACE_NAME_LENGTH = 80;
// Caratteri di controllo: il nome finisce nelle email di invito e nel selettore.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

// SQL statico in frammenti costanti; l'id del workspace è sempre un parametro legato.
const LOCK_WORKSPACE_ROW = Prisma.sql`SELECT "id" FROM "workspaces" WHERE "id" =`;
const FOR_UPDATE = Prisma.sql`FOR UPDATE`;

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
 * richieste concorrenti non lasciano il workspace senza OWNER (CWE-362). Chi possiede il workspace personale non ne esce.
 */
async function withLockedMembership<T>(
  { workspace, targetUserId }: MembershipChange,
  change: (
    tx: Prisma.TransactionClient,
    target: { role: WorkspaceRole; isPersonalOwner: boolean; otherOwners: number }
  ) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`${LOCK_WORKSPACE_ROW} ${workspace.id} ${FOR_UPDATE}`;
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

/** Abbandono del workspace (T-1503): ogni membro; l'ultimo OWNER e il proprietario del workspace personale no (409). */
export async function leaveWorkspace(user: { id: string }, workspaceId: unknown) {
  const workspace = await requireWorkspaceRole(user, workspaceId, "workspace.read");

  await withLockedMembership({ workspace, targetUserId: user.id }, async (tx, target) => {
    if (target.isPersonalOwner) {
      throw new LastOwnerError();
    }
    assertOwnerRemains(target);
    await deleteMembership(tx, workspace.id, user.id);
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
