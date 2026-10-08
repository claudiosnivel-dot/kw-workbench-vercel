import { isCommercialLive } from "@/lib/billing/launch";
import { getClientIp } from "@/lib/security/client-ip";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { type RateLimitRule, rateLimitRules } from "@/lib/security/rate-limit-config";
import { captchaUnavailable, isTurnstileReady, type TurnstileAction, verifyTurnstile } from "@/lib/security/turnstile";

/**
 * CAPTCHA dei form pubblici (T-1702), dopo il rate limit di T-1701 e prima della logica: obbligatorio quando Turnstile è
 * configurato o il lancio commerciale è attivo. Con il lancio attivo e senza chiavi → 503 CAPTCHA_UNAVAILABLE
 * (fail-closed, CWE-636): la registrazione, aperta solo col lancio attivo, non passa mai senza CAPTCHA. Con il lancio in
 * pausa e senza chiavi il recupero password resta senza CAPTCHA, protetto dai limiti di T-1701.
 */
async function requireCaptcha(request: Request, token: unknown, action: TurnstileAction): Promise<void> {
  if (isTurnstileReady()) {
    await verifyTurnstile(token, getClientIp(request), action);
    return;
  }
  if (await isCommercialLive()) {
    throw captchaUnavailable();
  }
}

type RateLimitRules = ReturnType<typeof rateLimitRules>;

/**
 * Guardia dei form pubblici di registrazione e richiesta di reset: prima le regole di rate limit costruite con l'IP del
 * client (T-1701, 429 RATE_LIMITED), poi il CAPTCHA (T-1702); la logica della rotta viene dopo, così un tentativo
 * bloccato non consuma hash né chiamate esterne.
 */
export async function guardPublicForm(
  request: Request,
  form: {
    action: TurnstileAction;
    token: unknown;
    limits: (ip: string, rules: RateLimitRules) => { key: string; rule: RateLimitRule }[];
  }
): Promise<void> {
  await enforceRateLimits(form.limits(getClientIp(request), rateLimitRules()));
  await requireCaptcha(request, form.token, form.action);
}
