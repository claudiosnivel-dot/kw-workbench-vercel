import { redeemOneTimeToken, sendOneTimeTokenEmail } from "@/lib/auth/one-time-token";
import { sendTemplateEmail } from "@/lib/email";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
// Limiti di reinvio per utente (T-1403), contati su email_verification_tokens.created_at.
const RESEND_MIN_INTERVAL_MS = 60 * 1000;
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESEND_MAX_IN_WINDOW = 5;

/** Nuovo token di verifica valido 24 h e invio di verify-email (T-1403); un utente legacy senza email non riceve nulla. */
export async function issueVerificationToken(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, display_name: true, ui_locale: true },
  });
  if (!user?.email) {
    return;
  }

  await sendOneTimeTokenEmail({
    table: "emailVerificationToken",
    ttlMs: VERIFICATION_TTL_MS,
    template: "verify-email",
    user: { ...user, email: user.email },
  });
}

/** Conferma dell'email (T-1403): solo un token consumato davvero imposta email_verified_at (se ancora nullo). */
export function consumeVerificationToken(token: string): Promise<boolean> {
  return redeemOneTimeToken("emailVerificationToken", token);
}

/**
 * Avviso account-exists a chi ha già un account (T-1403): la registrazione con un'email esistente non modifica
 * l'account e risponde come per un'email nuova; il titolare reale riceve i link a login e recupero password.
 */
export async function notifyExistingAccount(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { display_name: true, ui_locale: true } });
  if (!user) {
    return;
  }

  await sendTemplateEmail({
    to: email,
    template: "account-exists",
    locale: user.ui_locale ?? DEFAULT_LOCALE,
    vars: { displayName: user.display_name },
  });
}

/**
 * Secondi da attendere prima di un nuovo invio (T-1403): almeno 60 s dall'ultimo token e al massimo 5 token nelle
 * ultime 24 h per utente; 0 se l'invio è ammesso. Il valore va nell'header Retry-After del 429.
 */
export async function verificationResendRetryAfter(userId: string): Promise<number> {
  const now = Date.now();
  const recent = await prisma.emailVerificationToken.findMany({
    where: { user_id: userId, created_at: { gt: new Date(now - RESEND_WINDOW_MS) } },
    orderBy: { created_at: "desc" },
    take: RESEND_MAX_IN_WINDOW,
    select: { created_at: true },
  });

  const waitMs = Math.max(
    recent.length > 0 ? recent[0].created_at.getTime() + RESEND_MIN_INTERVAL_MS - now : 0,
    recent.length >= RESEND_MAX_IN_WINDOW ? recent[RESEND_MAX_IN_WINDOW - 1].created_at.getTime() + RESEND_WINDOW_MS - now : 0
  );
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}
