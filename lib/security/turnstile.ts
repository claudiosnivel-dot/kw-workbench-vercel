import { getPublicAppUrl, getTurnstileSettings, isTurnstileTestKey } from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";
import { isKnownClientIp } from "@/lib/security/client-ip";

/** Endpoint di verifica lato server di Cloudflare Turnstile (T-1702). */
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const MAX_TOKEN_LENGTH = 2048;
const SITEVERIFY_TIMEOUT_MS = 5_000;

/** Form protetti dal CAPTCHA, con l'action del widget che siteverify restituisce. */
export type TurnstileAction = "register" | "password-reset" | "contact";

type SiteverifyResponse = { success?: unknown; hostname?: unknown; action?: unknown; "error-codes"?: unknown };

/**
 * Voce captcha della checklist del lancio commerciale (T-1606, D-32): chiavi di Turnstile impostate insieme e non di
 * test in produzione (lib/env.ts), con la verifica lato server collegata a registrazione e recupero password.
 */
export function isTurnstileReady(): boolean {
  return getTurnstileSettings() !== null;
}

/** Site key pubblica per il widget; null se Turnstile non è configurato (nessun widget, CSP invariata). */
export function getTurnstileSiteKey(): string | null {
  return getTurnstileSettings()?.siteKey ?? null;
}

/** 503 CAPTCHA_UNAVAILABLE: verifica impossibile (configurazione assente, rete, timeout), mai un'accettazione. */
export function captchaUnavailable(): AppError {
  return new AppError(503, "CAPTCHA_UNAVAILABLE", "Verifica anti-bot non disponibile: riprova più tardi");
}

function captchaInvalid(): AppError {
  return new AppError(400, "CAPTCHA_INVALID", "Verifica anti-bot non valida: riprova");
}

function expectedHostname(): string | null {
  const url = getPublicAppUrl();
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

/**
 * Verifica lato server del token Turnstile (T-1702): token assente → 400 CAPTCHA_REQUIRED; più lungo di 2048 caratteri →
 * 400 CAPTCHA_INVALID senza chiamare siteverify; success false, hostname diverso dall'host di APP_PUBLIC_URL o action
 * diversa da quella attesa → 400 CAPTCHA_INVALID (CWE-345); Turnstile non configurato, APP_PUBLIC_URL assente, errore
 * di rete, timeout di 5 secondi o internal-error → 503 CAPTCHA_UNAVAILABLE, mai un'accettazione silenziosa (CWE-636).
 * Con una secret di test di Cloudflare (ammessa solo fuori produzione, lib/env.ts) siteverify restituisce hostname e
 * action fittizi: conta solo success. Il remoteip si invia solo se l'IP del client è noto.
 */
export async function verifyTurnstile(token: unknown, remoteIp: string, expectedAction: TurnstileAction): Promise<void> {
  if (typeof token !== "string" || token.length === 0) {
    throw new AppError(400, "CAPTCHA_REQUIRED", "Completa la verifica anti-bot");
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    throw captchaInvalid();
  }

  const settings = getTurnstileSettings();
  const hostname = expectedHostname();
  if (!settings || !hostname) {
    throw captchaUnavailable();
  }

  const form = new URLSearchParams({ secret: settings.secretKey, response: token });
  if (isKnownClientIp(remoteIp)) {
    form.set("remoteip", remoteIp);
  }

  let result: SiteverifyResponse;
  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`siteverify HTTP ${response.status}`);
    }
    result = (await response.json()) as SiteverifyResponse;
  } catch (error) {
    logger.warn("turnstile_siteverify_unavailable", { errorName: error instanceof Error ? error.name : typeof error });
    throw captchaUnavailable();
  }

  const errorCodes = Array.isArray(result["error-codes"]) ? result["error-codes"] : [];
  if (result.success !== true && errorCodes.includes("internal-error")) {
    throw captchaUnavailable();
  }
  const testSecret = isTurnstileTestKey(settings.secretKey);
  if (result.success !== true || (!testSecret && (result.hostname !== hostname || result.action !== expectedAction))) {
    throw captchaInvalid();
  }
}
