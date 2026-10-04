import { getEnv, getIntEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "kwb_session";

const DEVELOPMENT_BOOTSTRAP_PASSWORD = "changeme";
const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

export function isAuthEnabled(): boolean {
  return getEnv().authEnabled;
}

export function getAuthUsername(): string {
  return getEnv().authUsername;
}

/** Password del primo utente: in produzione niente default, niente changeme e almeno 12 caratteri. */
export function getAuthPassword(): string {
  const { isProduction, authPassword } = getEnv();

  if (!isProduction) {
    return authPassword ?? DEVELOPMENT_BOOTSTRAP_PASSWORD;
  }

  if (
    !authPassword ||
    authPassword === DEVELOPMENT_BOOTSTRAP_PASSWORD ||
    authPassword.length < MIN_BOOTSTRAP_PASSWORD_LENGTH
  ) {
    throw new Error(
      `APP_AUTH_PASSWORD non valida per il bootstrap del primo utente in produzione: obbligatoria, diversa dal default e lunga almeno ${MIN_BOOTSTRAP_PASSWORD_LENGTH} caratteri`
    );
  }

  return authPassword;
}

export function isPublicSignupEnabled(): boolean {
  const raw = (process.env.APP_PUBLIC_SIGNUP_ENABLED ?? "true").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

export function getSessionSecret(): string {
  return getEnv().sessionSecret;
}

export function getSessionMaxAgeSeconds(): number {
  return getIntEnv("APP_SESSION_MAX_AGE_SECONDS");
}

export function getEncryptionKeyMaterial(): string {
  return getEnv().encryptionKey;
}

export function shouldUseSecureCookies(): boolean {
  const raw = (process.env.APP_COOKIE_SECURE ?? "auto").toLowerCase();

  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }

  return process.env.NODE_ENV === "production";
}
