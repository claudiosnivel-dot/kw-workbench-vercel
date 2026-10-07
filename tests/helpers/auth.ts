import { UserRole, UserStatus, type User } from "@/lib/generated/prisma/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";

export const TEST_USER_PASSWORD = "test-password-not-real";

let userCounter = 0;

/**
 * Crea un utente via Prisma e restituisce il cookie di sessione firmato dall'app. Di default (T-1401…T-1405) l'email è
 * <displayName>@example.test, già verificata, e i termini correnti sono accettati: i test che li riguardano passano
 * emailVerified false o acceptedTermsVersion null.
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
): Promise<{ user: User; cookie: string }> {
  userCounter += 1;
  const displayName = options.displayName ?? `test-user-${userCounter}`;
  const user = await prisma.user.create({
    data: {
      email: options.email ?? `${displayName.toLowerCase()}@example.test`,
      email_verified_at: options.emailVerified === false ? null : new Date(),
      display_name: displayName,
      password_hash: await hashPassword(options.password ?? TEST_USER_PASSWORD),
      role: options.role ?? UserRole.SUBSCRIBER,
      status: options.status ?? UserStatus.ACTIVE,
      is_root_admin: options.isRootAdmin ?? false,
      accepted_terms_version: options.acceptedTermsVersion === undefined ? LEGAL_TERMS_VERSION : options.acceptedTermsVersion,
    },
  });

  const token = await createSessionToken({ userId: user.id, sessionVersion: user.session_version });

  return { user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}
