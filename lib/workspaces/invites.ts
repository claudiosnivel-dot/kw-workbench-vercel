import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "@/lib/auth/credentials";
import { normalizeEmail } from "@/lib/auth/email-address";
import { requireWorkspaceRole } from "@/lib/authz/workspace";
import { sendTemplateEmail } from "@/lib/email";
import { Prisma } from "@/lib/generated/prisma/client";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { AppError, ValidationError } from "@/lib/http/errors";
import type { AppLocale } from "@/lib/i18n/locale";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/** Validità di un invito (T-1503): 7 giorni dalla creazione. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Ruoli assegnabili con un invito: la proprietà passa solo con il trasferimento. */
const INVITABLE_ROLES: readonly WorkspaceRole[] = [WorkspaceRole.ADMIN, WorkspaceRole.MEMBER];

/** Token sconosciuto, scaduto, revocato o già usato: stessa risposta in tutti i casi, senza rivelarne lo stato. */
class InviteInvalidError extends AppError {
  constructor() {
    super(410, "INVITE_INVALID", "Invito non valido");
    this.name = "InviteInvalidError";
  }
}

/** SHA-256 esadecimale del token: l'unica forma salvata nel DB (CWE-312). */
function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Ruolo di un invito o di un cambio di ruolo: solo ADMIN o MEMBER, altrimenti 400. */
export function parseAssignableRole(value: unknown): WorkspaceRole {
  if (typeof value !== "string" || !INVITABLE_ROLES.includes(value as WorkspaceRole)) {
    throw new ValidationError("Ruolo non valido: usa ADMIN o MEMBER");
  }
  return value as WorkspaceRole;
}

/** Invito pendente: non accettato, non revocato e non scaduto all'istante indicato. */
function pendingAt(now: Date): Prisma.WorkspaceInviteWhereInput {
  return { accepted_at: null, revoked_at: null, expires_at: { gt: now } };
}

/**
 * Nuovo invito (T-1503): ADMIN o superiore (members.manage). Email normalizzata minuscola; 409 ALREADY_MEMBER se
 * l'email è di un membro, 409 INVITE_PENDING se c'è già un invito pendente. Token da 32 byte di crypto.randomBytes in
 * base64url (CWE-330), salvato solo come hash; il token in chiaro esiste solo nel link dell'email, nella lingua di chi
 * invita, e mai in risposte o log (CWE-532). Se l'email non parte l'invito non resta: 503 EMAIL_UNAVAILABLE.
 */
export async function createInvite(
  actor: AuthUser,
  workspaceId: unknown,
  input: { email?: unknown; role?: unknown },
  locale: AppLocale
) {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "members.manage");
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new AppError(400, "EMAIL_INVALID", "Email non valida");
  }
  const role = parseAssignableRole(input.role);
  const now = new Date();

  if (await prisma.membership.count({ where: { workspace_id: workspace.id, user: { email } } })) {
    throw new AppError(409, "ALREADY_MEMBER", "L'email appartiene già a un membro del workspace");
  }
  if (await prisma.workspaceInvite.count({ where: { workspace_id: workspace.id, email, ...pendingAt(now) } })) {
    throw new AppError(409, "INVITE_PENDING", "Esiste già un invito pendente per questa email");
  }

  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.workspaceInvite.create({
    data: {
      workspace_id: workspace.id,
      email,
      role,
      token_hash: hashInviteToken(token),
      invited_by_user_id: actor.id,
      created_at: now,
      expires_at: new Date(now.getTime() + INVITE_TTL_MS),
    },
    select: { id: true, email: true, role: true, expires_at: true },
  });

  try {
    await sendTemplateEmail({
      to: email,
      template: "workspace-invite",
      locale,
      vars: {
        inviteeName: email.slice(0, email.indexOf("@")),
        inviterName: actor.displayName,
        workspaceName: workspace.name,
        token,
      },
    });
  } catch {
    // L'errore d'invio è già nei log del mittente; senza email l'invito non serve e non resta pendente.
    await prisma.workspaceInvite.delete({ where: { id: invite.id } });
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Invio dell'email non disponibile");
  }

  logger.info("workspace_invite_created", { inviteId: invite.id, workspaceId: workspace.id });
  return { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expires_at.toISOString() };
}

/** Revoca di un invito pendente del workspace (members.manage): 404 INVITE_NOT_FOUND se non c'è o non è pendente. */
export async function revokeInvite(actor: { id: string }, workspaceId: unknown, inviteId: string) {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "members.manage");
  const revokedAt = new Date();
  const { count } = await prisma.workspaceInvite.updateMany({
    where: { id: inviteId, workspace_id: workspace.id, accepted_at: null, revoked_at: null },
    data: { revoked_at: revokedAt },
  });
  if (count !== 1) {
    throw new AppError(404, "INVITE_NOT_FOUND", "Invito non trovato");
  }
  logger.info("workspace_invite_revoked", { inviteId, workspaceId: workspace.id });
  return { id: inviteId, revokedAt: revokedAt.toISOString() };
}

/** Inviti pendenti del workspace per la pagina /workspace (T-1504), senza token né hash. */
export function listPendingInvites(workspaceId: string) {
  return prisma.workspaceInvite.findMany({
    where: { workspace_id: workspaceId, ...pendingAt(new Date()) },
    orderBy: { created_at: "asc" },
    select: { id: true, email: true, role: true, created_at: true, expires_at: true },
  });
}

/**
 * Accettazione di un invito (T-1503): token valido (altrimenti 410 INVITE_INVALID), email dell'utente uguale a quella
 * dell'invito (403 INVITE_EMAIL_MISMATCH) e verificata (403 EMAIL_NOT_VERIFIED). Membership e accepted_at nella stessa
 * transazione con un UPDATE condizionato (non accettato, non revocato, non scaduto): con richieste concorrenti una
 * sola consuma il token (CWE-367, CWE-613).
 */
export async function acceptInvite(user: AuthUser, token: unknown) {
  if (typeof token !== "string" || token.length === 0 || token.length > 128) {
    throw new InviteInvalidError();
  }
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const invite = await prisma.workspaceInvite.findFirst({
    where: { token_hash: tokenHash, ...pendingAt(now) },
    select: { id: true, workspace_id: true, email: true, role: true },
  });
  if (!invite) {
    throw new InviteInvalidError();
  }
  if (user.email !== invite.email) {
    throw new AppError(403, "INVITE_EMAIL_MISMATCH", "L'invito è per un'altra email");
  }
  if (!user.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verifica la tua email prima di accettare l'invito");
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.workspaceInvite.updateMany({
      where: { id: invite.id, ...pendingAt(now) },
      data: { accepted_at: now },
    });
    if (count !== 1) {
      throw new InviteInvalidError();
    }
    try {
      await tx.membership.create({ data: { workspace_id: invite.workspace_id, user_id: user.id, role: invite.role } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "ALREADY_MEMBER", "Fai già parte del workspace");
      }
      throw error;
    }
  });

  logger.info("workspace_invite_accepted", { inviteId: invite.id, workspaceId: invite.workspace_id });
  return { workspaceId: invite.workspace_id, role: invite.role };
}
