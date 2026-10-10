import { writeAuditLog } from "@/lib/admin/audit";
import type { AuthUser } from "@/lib/auth/credentials";
import { verifyUserPassword } from "@/lib/auth/credentials";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { AppError } from "@/lib/http/errors";
import { revokeAndClearGoogleSheetsCredential } from "@/lib/integrations/google-sheets";
import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

// Abbonamenti ancora da disdire (T-1604) prima di poter cancellare l'account: canceled è l'unico stato chiuso.
const OPEN_SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["trialing", "active", "past_due", "paused"]);

type BlockingWorkspace = { id: string; name: string };

/** Workspace di cui l'utente è l'unico OWNER, con abbonamento e numero degli altri membri. */
async function soleOwnedWorkspaces(userId: string) {
  const rows = await prisma.membership.findMany({
    where: { user_id: userId, role: "OWNER", workspace: { memberships: { none: { role: "OWNER", user_id: { not: userId } } } } },
    select: {
      workspace: {
        select: {
          id: true,
          name: true,
          subscription: { select: { status: true } },
          _count: { select: { memberships: { where: { user_id: { not: userId } } } } },
        },
      },
    },
  });
  return rows.map((row) => row.workspace);
}

/**
 * Metadata del registro admin senza riferimenti all'utente cancellato (T-1804, CWE-359): ogni stringa che contiene id o
 * email, o che coincide con il nome mostrato, diventa null; struttura e altri valori restano.
 */
function scrubMetadata(value: Prisma.JsonValue, identity: { id: string; email: string | null; displayName: string }): Prisma.JsonValue {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    const mentions =
      value.includes(identity.id) ||
      (identity.email !== null && lower.includes(identity.email.toLowerCase())) ||
      lower.trim() === identity.displayName.trim().toLowerCase();
    return mentions ? null : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubMetadata(item, identity));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubMetadata(item ?? null, identity)]));
  }
  return value;
}

/**
 * Cancellazione dell'account da parte dell'utente (T-1804, GDPR). Controlli in ordine: tentativi per utente (T-2001:
 * oltre la soglia 429 RATE_LIMITED con Retry-After prima di leggere la password, CWE-307), password attuale (403
 * INVALID_PASSWORD, CWE-306), root admin (409 ROOT_ADMIN), unico OWNER di un workspace con un abbonamento non disdetto
 * (409 ACTIVE_SUBSCRIPTION) o con altri membri (409 OWNERSHIP_TRANSFER_REQUIRED, D-29), ciascuno con l'elenco dei
 * workspace. Poi revoca del token di Google Sheets presso Google (T-906) e, in una transazione: workspace in cui
 * l'utente è l'unico membro (progetti in cascata), workspace personale con altri membri staccato dall'utente, inviti
 * verso la sua email, righe del registro admin anonimizzate (restano, senza id, nome ed email), tentativi del rate
 * limit della cancellazione (la chiave contiene l'id), riga users (membership, credenziali e token in cascata) e una riga
 * account.delete anonima nel registro (T-2001: nessun attore, bersaglio, metadata o IP). billing_events restano per gli
 * obblighi contabili (D-15). Le sessioni esistenti smettono di valere perché l'utente non esiste più.
 */
export async function deleteOwnAccount(user: AuthUser, password: unknown): Promise<void> {
  const rateLimitKey = `account-delete:user:${user.id}`;
  await enforceRateLimits([{ key: rateLimitKey, rule: rateLimitRules().accountDelete }]);
  if (typeof password !== "string" || password.length === 0 || !(await verifyUserPassword(user.id, password))) {
    throw new AppError(403, "INVALID_PASSWORD", "Password non corretta");
  }
  if (user.isRootAdmin) {
    throw new AppError(409, "ROOT_ADMIN", "Il root admin non può cancellare il proprio account");
  }

  const owned = await soleOwnedWorkspaces(user.id);
  const listed = (rows: typeof owned): BlockingWorkspace[] => rows.map(({ id, name }) => ({ id, name }));
  const withSubscription = owned.filter((workspace) => workspace.subscription && OPEN_SUBSCRIPTION_STATUSES.has(workspace.subscription.status));
  if (withSubscription.length > 0) {
    throw new AppError(409, "ACTIVE_SUBSCRIPTION", "Disdici prima gli abbonamenti dei workspace di cui sei l'unico proprietario", {
      workspaces: listed(withSubscription),
    });
  }
  const shared = owned.filter((workspace) => workspace._count.memberships > 0);
  if (shared.length > 0) {
    throw new AppError(409, "OWNERSHIP_TRANSFER_REQUIRED", "Trasferisci prima la proprietà dei workspace condivisi", {
      workspaces: listed(shared),
    });
  }

  await revokeAndClearGoogleSheetsCredential(user.id);

  const identity = { id: user.id, email: user.email, displayName: user.displayName };
  const auditRows = await prisma.adminAuditLog.findMany({
    where: { OR: [{ actor_user_id: user.id }, { target_id: user.id }] },
    select: { id: true, actor_user_id: true, target_id: true, metadata: true },
  });

  await prisma.$transaction([
    prisma.workspace.deleteMany({
      where: { AND: [{ memberships: { some: { user_id: user.id } } }, { memberships: { every: { user_id: user.id } } }] },
    }),
    prisma.workspace.updateMany({ where: { personal_for_user_id: user.id }, data: { personal_for_user_id: null } }),
    ...(user.email ? [prisma.workspaceInvite.deleteMany({ where: { email: user.email } })] : []),
    ...auditRows.map((row) =>
      prisma.adminAuditLog.update({
        where: { id: row.id },
        data: {
          ...(row.actor_user_id === user.id ? { actor_user_id: null, ip: null } : {}),
          ...(row.target_id === user.id ? { target_id: null } : {}),
          metadata: scrubMetadata(row.metadata, identity) as Prisma.InputJsonValue,
        },
      })
    ),
    prisma.rateLimitHit.deleteMany({ where: { key: rateLimitKey } }),
    prisma.user.delete({ where: { id: user.id } }),
    writeAuditLog(prisma, { actorUserId: null, action: "account.delete", targetType: "user" }),
  ]);
}
