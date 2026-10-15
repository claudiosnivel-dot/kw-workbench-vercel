import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "@/lib/auth/credentials";
import { normalizeEmail } from "@/lib/auth/email-address";
import { requireWorkspaceRole } from "@/lib/authz/workspace";
import { assertSeatAvailable, loadPlanGuard } from "@/lib/billing/enforce";
import { isEmailDeliveryAvailable, sendTemplateEmail } from "@/lib/email";
import { inviteLink } from "@/lib/email/templates/workspace-invite";
import { Prisma } from "@/lib/generated/prisma/client";
import { WorkspaceRole } from "@/lib/generated/prisma/enums";
import { AppError, RateLimitedError, ValidationError } from "@/lib/http/errors";
import type { AppLocale } from "@/lib/i18n/locale";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

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

/** Campi di un invito mostrati a chi invita, senza token né hash. */
const INVITE_VIEW = { id: true, email: true, role: true, expires_at: true } satisfies Prisma.WorkspaceInviteSelect;

type InviteView = Prisma.WorkspaceInviteGetPayload<{ select: typeof INVITE_VIEW }>;

/** Invito appena creato o rinnovato: inviteUrl compare solo in questa risposta, mai in elenchi o log (T-3201, CWE-532). */
type IssuedInvite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  inviteUrl: string;
  emailSent: boolean;
};

/** 409 ALREADY_MEMBER se l'email è di un membro, 409 INVITE_PENDING se ha già un altro invito pendente (T-1503). */
async function assertInvitable(workspaceId: string, email: string, now: Date, otherThan?: string): Promise<void> {
  if (await prisma.membership.count({ where: { workspace_id: workspaceId, user: { email } } })) {
    throw new AppError(409, "ALREADY_MEMBER", "L'email appartiene già a un membro del workspace");
  }
  const others: Prisma.WorkspaceInviteWhereInput = otherThan ? { id: { not: otherThan } } : {};
  if (await prisma.workspaceInvite.count({ where: { workspace_id: workspaceId, email, ...pendingAt(now), ...others } })) {
    throw new AppError(409, "INVITE_PENDING", "Esiste già un invito pendente per questa email");
  }
}

/** Limite condiviso fra creazione e rinnovo degli inviti del workspace (T-3202, CWE-799): oltre la soglia 429 RATE_LIMITED. */
async function enforceInviteRate(workspaceId: string): Promise<void> {
  const key = `workspace-invite:workspace:${workspaceId}`;
  const { allowed, retryAfterSeconds } = await consumeRateLimit(key, rateLimitRules().workspaceInvite);
  if (!allowed) {
    throw new RateLimitedError(retryAfterSeconds);
  }
}

/**
 * Link per chi invita ed email workspace-invite nella sua lingua, solo se l'invio è disponibile (T-3201, T-3001). Un
 * invio non riuscito, già nei log del mittente, lascia l'invito valido: emailSent false e il link resta da copiare.
 */
async function issueInvite(
  actor: AuthUser,
  workspaceName: string,
  invite: InviteView,
  token: string,
  locale: AppLocale
): Promise<IssuedInvite> {
  const emailSent =
    isEmailDeliveryAvailable() &&
    (await sendTemplateEmail({
      to: invite.email,
      template: "workspace-invite",
      locale,
      vars: {
        inviteeName: invite.email.slice(0, invite.email.indexOf("@")),
        inviterName: actor.displayName,
        workspaceName,
        token,
      },
    }).then(
      () => true,
      () => false
    ));
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expires_at.toISOString(),
    inviteUrl: inviteLink(token),
    emailSent,
  };
}

/**
 * Nuovo invito (T-1503, T-3201): ADMIN o superiore (members.manage). Email normalizzata minuscola; 409 ALREADY_MEMBER se
 * l'email è di un membro, 409 INVITE_PENDING se c'è già un invito pendente, poi il limite condiviso con il rinnovo.
 * Token da 32 byte di crypto.randomBytes in base64url (CWE-330), salvato solo come hash; il token in chiaro esiste solo
 * nel link restituito a chi invita e in quello dell'email, mai nei log (CWE-532). Un'email non partita non annulla
 * l'invito.
 */
export async function createInvite(
  actor: AuthUser,
  workspaceId: unknown,
  input: { email?: unknown; role?: unknown },
  locale: AppLocale
): Promise<IssuedInvite> {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "members.manage");
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new AppError(400, "EMAIL_INVALID", "Email non valida");
  }
  const role = parseAssignableRole(input.role);
  const now = new Date();
  await assertInvitable(workspace.id, email, now);
  await enforceInviteRate(workspace.id);

  const token = randomBytes(32).toString("base64url");
  // Posti del piano (T-1605): membership e inviti pendenti, contati sotto il lock del workspace con l'insert.
  const plan = await loadPlanGuard(workspace.id);
  const invite = await prisma.$transaction(async (tx) => {
    await assertSeatAvailable(tx, plan);
    return tx.workspaceInvite.create({
      data: {
        workspace_id: workspace.id,
        email,
        role,
        token_hash: hashInviteToken(token),
        invited_by_user_id: actor.id,
        created_at: now,
        expires_at: new Date(now.getTime() + INVITE_TTL_MS),
      },
      select: INVITE_VIEW,
    });
  });

  logger.info("workspace_invite_created", { inviteId: invite.id, workspaceId: workspace.id });
  return issueInvite(actor, workspace.name, invite, token, locale);
}

/**
 * Nuovo link di un invito aperto (T-3202): members.manage; invito del workspace non accettato né revocato, scaduto o no,
 * altrimenti 410 INVITE_INVALID. Nuovo token da 32 byte salvato solo come hash al posto del vecchio, che smette di
 * valere (CWE-613), e scadenza a 7 giorni da adesso; stessi 409 e stesso limite della creazione, email come T-3201.
 */
export async function renewInvite(actor: AuthUser, workspaceId: unknown, inviteId: string, locale: AppLocale): Promise<IssuedInvite> {
  const workspace = await requireWorkspaceRole(actor, workspaceId, "members.manage");
  const open: Prisma.WorkspaceInviteWhereInput = { id: inviteId, workspace_id: workspace.id, accepted_at: null, revoked_at: null };
  const current = await prisma.workspaceInvite.findFirst({ where: open, select: { email: true, expires_at: true } });
  if (!current) {
    throw new InviteInvalidError();
  }
  const now = new Date();
  await assertInvitable(workspace.id, current.email, now, inviteId);
  await enforceInviteRate(workspace.id);

  const token = randomBytes(32).toString("base64url");
  const plan = await loadPlanGuard(workspace.id);
  const invite = await prisma.$transaction(async (tx) => {
    // Posti del piano (T-1605): uno scaduto torna pendente e riprende un posto, uno ancora valido lo occupa già.
    if (current.expires_at <= now) {
      await assertSeatAvailable(tx, plan);
    }
    const { count } = await tx.workspaceInvite.updateMany({
      where: open,
      data: { token_hash: hashInviteToken(token), expires_at: new Date(now.getTime() + INVITE_TTL_MS) },
    });
    if (count !== 1) {
      throw new InviteInvalidError();
    }
    return tx.workspaceInvite.findUniqueOrThrow({ where: { id: inviteId }, select: INVITE_VIEW });
  });

  logger.info("workspace_invite_renewed", { inviteId, workspaceId: workspace.id });
  return issueInvite(actor, workspace.name, invite, token, locale);
}

/** Revoca di un invito aperto, anche scaduto (members.manage, T-3202): 404 INVITE_NOT_FOUND se non c'è o è chiuso. */
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

/** Inviti aperti del workspace per la sezione Membri (T-3202): non accettati né revocati, scaduti compresi con expired. */
export async function listOpenInvites(workspaceId: string) {
  const now = new Date();
  const invites = await prisma.workspaceInvite.findMany({
    where: { workspace_id: workspaceId, accepted_at: null, revoked_at: null },
    orderBy: { created_at: "asc" },
    select: INVITE_VIEW,
  });
  return invites.map((invite) => ({ ...invite, expired: invite.expires_at <= now }));
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

  const plan = await loadPlanGuard(invite.workspace_id);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.workspaceInvite.updateMany({
      where: { id: invite.id, ...pendingAt(now) },
      data: { accepted_at: now },
    });
    if (count !== 1) {
      throw new InviteInvalidError();
    }
    // Posti del piano (T-1605): l'invito appena consumato non conta più come pendente, conta la nuova membership.
    await assertSeatAvailable(tx, plan);
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
