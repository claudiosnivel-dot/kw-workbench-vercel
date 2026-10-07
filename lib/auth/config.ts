import { getAdminEmail, getEnv, getIntEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "kwb_session";

/** Segreti senza valore di default, in nessun ambiente: in produzione li impone già parseEnv. */
function requireSecret(name: "APP_SESSION_SECRET" | "APP_ENCRYPTION_KEY", value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} non impostata: non ha un valore di default, va impostata anche fuori produzione`);
  }
  return value;
}

export function isAuthEnabled(): boolean {
  return getEnv().authEnabled;
}

/**
 * Email del root admin iniziale (T-1401): APP_ADMIN_EMAIL, senza default in nessun ambiente (in produzione la impone
 * già parseEnv). Serve solo al bootstrap con la tabella users vuota e al seed.
 */
export function getRootAdminEmail(): string {
  getEnv();
  const email = getAdminEmail();
  if (!email) {
    throw new Error("APP_ADMIN_EMAIL non impostata: serve a creare il root admin con la tabella users vuota");
  }
  return email;
}

export function isPublicSignupEnabled(): boolean {
  const raw = (process.env.APP_PUBLIC_SIGNUP_ENABLED ?? "true").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

export function getSessionSecret(): string {
  return requireSecret("APP_SESSION_SECRET", getEnv().sessionSecret);
}

export function getSessionMaxAgeSeconds(): number {
  return getIntEnv("APP_SESSION_MAX_AGE_SECONDS");
}

export function getEncryptionKeyMaterial(): string {
  return requireSecret("APP_ENCRYPTION_KEY", getEnv().encryptionKey);
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
