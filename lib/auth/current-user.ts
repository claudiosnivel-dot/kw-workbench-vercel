import { cookies } from "next/headers";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { ensureLegacyDefaultUser, findAuthUserById, type AuthUser } from "@/lib/auth/credentials";
import { verifySessionToken } from "@/lib/auth/session";

export class AuthRequiredError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function readCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawName, ...rest] = pair.trim().split("=");
    if (!rawName || rest.length === 0) {
      continue;
    }

    if (rawName !== key) {
      continue;
    }

    const rawValue = rest.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

async function resolveUserFromToken(token: string | null): Promise<AuthUser | null> {
  const session = await verifySessionToken(token);
  if (!session) {
    return null;
  }

  const user = await findAuthUserById(session.userId);
  if (!user) {
    return null;
  }

  return user;
}

export async function getOptionalAuthenticatedUserFromRequest(request: Request): Promise<AuthUser | null> {
  if (!isAuthEnabled()) {
    return ensureLegacyDefaultUser();
  }

  const cookieHeader = request.headers.get("cookie");
  const token = readCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  return resolveUserFromToken(token);
}

export async function requireAuthenticatedUserFromRequest(request: Request): Promise<AuthUser> {
  const user = await getOptionalAuthenticatedUserFromRequest(request);
  if (!user) {
    throw new AuthRequiredError();
  }

  return user;
}

export async function getOptionalAuthenticatedUserFromCookies(): Promise<AuthUser | null> {
  if (!isAuthEnabled()) {
    return ensureLegacyDefaultUser();
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  return resolveUserFromToken(token);
}

export async function requireAuthenticatedUserFromCookies(): Promise<AuthUser> {
  const user = await getOptionalAuthenticatedUserFromCookies();
  if (!user) {
    throw new AuthRequiredError();
  }

  return user;
}
