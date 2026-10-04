import { UserRole, UserStatus, type User } from "@/lib/generated/prisma/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { createSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";

export const TEST_USER_PASSWORD = "test-password-not-real";

let userCounter = 0;

/** Crea un utente via Prisma e restituisce il cookie di sessione firmato dall'app. */
export async function createUserWithSession(
  options: {
    role?: UserRole;
    status?: UserStatus;
    isRootAdmin?: boolean;
    username?: string;
    password?: string;
  } = {}
): Promise<{ user: User; cookie: string }> {
  userCounter += 1;
  const user = await prisma.user.create({
    data: {
      username: options.username ?? `test-user-${userCounter}`,
      password_hash: await hashPassword(options.password ?? TEST_USER_PASSWORD),
      role: options.role ?? UserRole.SUBSCRIBER,
      status: options.status ?? UserStatus.ACTIVE,
      is_root_admin: options.isRootAdmin ?? false,
    },
  });

  const token = await createSessionToken({ userId: user.id, sessionVersion: user.session_version });

  return { user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}
