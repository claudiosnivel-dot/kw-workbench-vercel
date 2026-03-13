export const SESSION_COOKIE_NAME = "kwb_session";

export function isAuthEnabled(): boolean {
  const raw = (process.env.APP_AUTH_ENABLED ?? "true").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

export function getAuthUsername(): string {
  return process.env.APP_AUTH_USERNAME ?? "admin";
}

export function getAuthPassword(): string {
  return process.env.APP_AUTH_PASSWORD ?? "changeme";
}

export function isPublicSignupEnabled(): boolean {
  const raw = (process.env.APP_PUBLIC_SIGNUP_ENABLED ?? "true").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

export function getSessionSecret(): string {
  return process.env.APP_SESSION_SECRET ?? "change-this-session-secret";
}

export function getSessionMaxAgeSeconds(): number {
  const raw = Number(process.env.APP_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 7);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60 * 60 * 24 * 7;
}

export function getEncryptionKeyMaterial(): string {
  return process.env.APP_ENCRYPTION_KEY ?? "change-this-encryption-key";
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