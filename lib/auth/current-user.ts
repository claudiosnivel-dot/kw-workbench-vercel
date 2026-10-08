import { UserRole, UserStatus } from "@/lib/generated/prisma/enums";
import { cookies } from "next/headers";
import { cache } from "react";
import { isAuthEnabled, SESSION_COOKIE_NAME } from "@/lib/auth/config";
import { ensureLegacyDefaultUser, findAuthUserById, type AuthUser } from "@/lib/auth/credentials";
import { verifySessionToken } from "@/lib/auth/session";
import { AppError, AuthRequiredError, ForbiddenError } from "@/lib/http/errors";

/** Pagina del cambio password obbligato dopo un reset da admin (T-1704). */
export const PASSWORD_CHANGE_PATH = "/account/password";

/** 403 PASSWORD_CHANGE_REQUIRED: password impostata da un admin e non ancora cambiata (T-1704, CWE-269). */
export class PasswordChangeRequiredError extends AppError {
  constructor() {
    super(403, "PASSWORD_CHANGE_REQUIRED", "Cambia la password prima di continuare", { redirect: PASSWORD_CHANGE_PATH });
    this.name = "PasswordChangeRequiredError";
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

  const user = await findAuthUserById(session.uid);
  if (!user) {
    return null;
  }

  if (user.status !== UserStatus.ACTIVE) {
    return null;
  }

  // Revoca lato server: un token emesso prima dell'ultimo incremento non vale più (T-501).
  if (user.sessionVersion !== session.ver) {
    return null;
  }

  return user;
}

export function isAdminUser(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN;
}

function isRootAdminUser(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN && user.isRootAdmin;
}

export async function getOptionalAuthenticatedUserFromRequest(request: Request): Promise<AuthUser | null> {
  if (!isAuthEnabled()) {
    return ensureLegacyDefaultUser();
  }

  const cookieHeader = request.headers.get("cookie");
  const token = readCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  return resolveUserFromToken(token);
}

/**
 * Utente autenticato della rotta API. Con la password impostata da un admin e non ancora cambiata (T-1704) ogni API
 * risponde 403 PASSWORD_CHANGE_REQUIRED, tranne quelle che passano allowPendingPasswordChange: cambio password e
 * logout. La sola verifica della sessione resta in getOptionalAuthenticatedUserFromRequest.
 */
export async function requireAuthenticatedUserFromRequest(
  request: Request,
  options: { allowPendingPasswordChange?: boolean } = {}
): Promise<AuthUser> {
  const user = await getOptionalAuthenticatedUserFromRequest(request);
  if (!user) {
    throw new AuthRequiredError();
  }

  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    throw new PasswordChangeRequiredError();
  }

  return user;
}

export async function requireAdminUserFromRequest(request: Request): Promise<AuthUser> {
  const user = await requireAuthenticatedUserFromRequest(request);
  if (!isAdminUser(user)) {
    throw new ForbiddenError();
  }

  return user;
}

export async function requireRootAdminUserFromRequest(request: Request): Promise<AuthUser> {
  const user = await requireAdminUserFromRequest(request);
  if (!isRootAdminUser(user)) {
    throw new ForbiddenError();
  }

  return user;
}

/**
 * Utente della richiesta dai cookie, risolto una volta per richiesta: layout e pagina condividono il risultato
 * con cache() di React, che vive solo dentro la richiesta; la verifica della sessione (T-501) resta per ogni
 * richiesta (T-1105).
 */
export const getOptionalAuthenticatedUserFromCookies = cache(async (): Promise<AuthUser | null> => {
  if (!isAuthEnabled()) {
    return ensureLegacyDefaultUser();
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  return resolveUserFromToken(token);
});
