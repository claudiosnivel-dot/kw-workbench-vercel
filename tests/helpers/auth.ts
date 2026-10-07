import { type Prisma, UserRole, UserStatus, type User } from "@/lib/generated/prisma/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";
import { createPersonalWorkspace } from "@/lib/workspaces/personal";

export const TEST_USER_PASSWORD = "test-password-not-real";

let userCounter = 0;

/**
 * Utente creato via Prisma con il suo workspace personale e la membership OWNER nella stessa transazione, come nella
 * registrazione (T-1501). Lo usano anche gli utenti degli E2E (tests/e2e/credentials.ts).
 */
export async function createUserWithWorkspace(data: Prisma.UserCreateInput): Promise<User & { workspaceId: string }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data });
    return { ...user, workspaceId: (await createPersonalWorkspace(tx, user)).id };
  });
}

/**
 * Crea un utente via Prisma e restituisce il cookie di sessione firmato dall'app. Di default (T-1401…T-1405) l'email è
 * <displayName>@example.test, già verificata, e i termini correnti sono accettati: i test che li riguardano passano
 * emailVerified false o acceptedTermsVersion null. Come nella registrazione (T-1501) l'utente nasce con il workspace
 * personale e la membership OWNER: workspaceId è il suo id.
 */
export async function createUserWithSession(
  options: {
    role?: UserRole;
    status?: UserStatus;
    isRootAdmin?: boolean;
    displayName?: string;
    email?: string;
    emailVerified?: boolean;
    acceptedTermsVersion?: string | null;
    password?: string;
  } = {}
): Promise<{ user: User; cookie: string; workspaceId: string }> {
  userCounter += 1;
  const displayName = options.displayName ?? `test-user-${userCounter}`;
  const { workspaceId, ...user } = await createUserWithWorkspace({
    email: options.email ?? `${displayName.toLowerCase()}@example.test`,
    email_verified_at: options.emailVerified === false ? null : new Date(),
    display_name: displayName,
    password_hash: await hashPassword(options.password ?? TEST_USER_PASSWORD),
    role: options.role ?? UserRole.SUBSCRIBER,
    status: options.status ?? UserStatus.ACTIVE,
    is_root_admin: options.isRootAdmin ?? false,
    accepted_terms_version: options.acceptedTermsVersion === undefined ? LEGAL_TERMS_VERSION : options.acceptedTermsVersion,
  });

  const token = await createSessionToken({ userId: user.id, sessionVersion: user.session_version });

  return { user, cookie: `${SESSION_COOKIE_NAME}=${token}`, workspaceId };
}

/** Id del workspace personale dell'utente (T-1501): dove vanno i progetti creati direttamente nei test. */
export async function personalWorkspaceId(userId: string): Promise<string> {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { personal_for_user_id: userId }, select: { id: true } });
  return workspace.id;
}
