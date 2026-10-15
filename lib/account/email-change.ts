import { type AuthUser, verifyUserPassword } from "@/lib/auth/credentials";
import { normalizeEmail } from "@/lib/auth/email-address";
import { generateOneTimeToken, hashOneTimeToken } from "@/lib/auth/one-time-token";
import { isUniqueViolation } from "@/lib/db/unique-violation";
import { isEmailDeliveryAvailable, sendTemplateEmail } from "@/lib/email";
import type { UiLocale } from "@/lib/generated/prisma/client";
import { AppError } from "@/lib/http/errors";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

/** Richiesta in attesa mostrata nel Profilo (T-3001): mai il token né il suo hash. */
export type PendingEmailChange = { newEmail: string; expiresAt: Date };

/** Indirizzo, nome e lingua dell'utente prima del cambio: servono all'avviso al vecchio indirizzo. */
export type PreviousIdentity = { email: string | null; displayName: string; uiLocale: UiLocale | null };

/** Esito della conferma (T-3001): con changed anche l'identità di prima, per l'avviso. */
export type EmailChangeConfirmation =
  | { outcome: "changed"; previous: PreviousIdentity }
  | { outcome: "taken" }
  | { outcome: "invalid" };

/** Indirizzo preso da un altro utente tra la richiesta e la conferma: annulla la transazione della conferma. */
class EmailTakenOnConfirm extends Error {}

/** Le richieste non usate dell'utente diventano inutilizzabili (nuova richiesta o Annulla). */
function closePendingRequests(userId: string, now: Date) {
  return prisma.emailChangeToken.updateMany({ where: { user_id: userId, used_at: null }, data: { used_at: now } });
}

/**
 * Controlli della richiesta di cambio dell'email (T-3001), in ordine: password attuale (400 CURRENT_PASSWORD_REQUIRED,
 * 401 CURRENT_PASSWORD_INVALID), nuova email normalizzata (400 EMAIL_INVALID, 400 EMAIL_UNCHANGED), invio delle email
 * disponibile (503 EMAIL_UNAVAILABLE), poi 5 richieste l'ora per utente (429 RATE_LIMITED, CWE-799). Il risultato è la
 * richiesta come la vedrà il Profilo, uguale anche per un indirizzo già usato: token ed email li crea issueEmailChange.
 */
export async function checkEmailChangeRequest(
  user: AuthUser,
  input: { newEmail?: unknown; currentPassword?: unknown }
): Promise<PendingEmailChange> {
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!currentPassword) {
    throw new AppError(400, "CURRENT_PASSWORD_REQUIRED", "La password attuale è obbligatoria");
  }
  if (!(await verifyUserPassword(user.id, currentPassword))) {
    throw new AppError(401, "CURRENT_PASSWORD_INVALID", "La password attuale non è valida");
  }

  const newEmail = normalizeEmail(input.newEmail);
  if (!newEmail) {
    throw new AppError(400, "EMAIL_INVALID", "Email non valida");
  }
  if (newEmail === user.email) {
    throw new AppError(400, "EMAIL_UNCHANGED", "È già l'email dell'account");
  }
  if (!isEmailDeliveryAvailable()) {
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Invio delle email non disponibile");
  }

  await enforceRateLimits([{ key: `email-change:user:${user.id}`, rule: rateLimitRules().emailChange }]);
  return { newEmail, expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) };
}

/**
 * Richiesta già controllata, da eseguire dopo la risposta: chiude le richieste precedenti e, solo se l'indirizzo non è
 * di un altro utente, salva l'hash del nuovo token (32 byte, CWE-330) e invia email-change al nuovo indirizzo nella
 * lingua dell'utente. Un indirizzo già usato non riceve nulla (CWE-204); il token in chiaro esiste solo nel link.
 */
export async function issueEmailChange(user: AuthUser, newEmail: string): Promise<void> {
  const now = new Date();
  await closePendingRequests(user.id, now);
  if (await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) {
    return;
  }

  const token = generateOneTimeToken();
  await prisma.emailChangeToken.create({
    data: {
      user_id: user.id,
      new_email: newEmail,
      token_hash: hashOneTimeToken(token),
      created_at: now,
      expires_at: new Date(now.getTime() + EMAIL_CHANGE_TTL_MS),
    },
  });
  await sendTemplateEmail({
    to: newEmail,
    template: "email-change",
    locale: user.uiLocale ?? DEFAULT_LOCALE,
    vars: { displayName: user.displayName, token },
  });
}

/** Annulla (T-3001): le richieste in attesa dell'utente diventano inutilizzabili. */
export async function cancelEmailChange(userId: string): Promise<void> {
  await closePendingRequests(userId, new Date());
}

/** Richiesta valida più recente dell'utente (non usata e non scaduta), oppure null. */
export async function getPendingEmailChange(userId: string): Promise<PendingEmailChange | null> {
  const pending = await prisma.emailChangeToken.findFirst({
    where: { user_id: userId, used_at: null, expires_at: { gt: new Date() } },
    orderBy: { created_at: "desc" },
    select: { new_email: true, expires_at: true },
  });
  return pending ? { newEmail: pending.new_email, expiresAt: pending.expires_at } : null;
}

/**
 * Conferma del cambio (T-3001, CWE-367): in una transazione il token valido (hash, non usato, non scaduto) diventa usato
 * con un solo updateMany condizionale, poi users.email = new_email ed email_verified_at = adesso, perché il link prova il
 * possesso del nuovo indirizzo. I link di verifica e di recupero password ancora aperti erano del vecchio indirizzo e
 * smettono di valere. Se nel frattempo l'indirizzo è di un altro utente la transazione si annulla senza modifiche.
 */
export async function confirmEmailChange(token: string): Promise<EmailChangeConfirmation> {
  const tokenHash = hashOneTimeToken(token);
  const now = new Date();

  try {
    const previous = await prisma.$transaction(async (tx) => {
      const { count } = await tx.emailChangeToken.updateMany({
        where: { token_hash: tokenHash, used_at: null, expires_at: { gt: now } },
        data: { used_at: now },
      });
      if (count !== 1) {
        return null;
      }

      const request = await tx.emailChangeToken.findUniqueOrThrow({
        where: { token_hash: tokenHash },
        select: { user_id: true, new_email: true },
      });
      const owner = await tx.user.findUnique({ where: { email: request.new_email }, select: { id: true } });
      if (owner && owner.id !== request.user_id) {
        throw new EmailTakenOnConfirm();
      }

      const before = await tx.user.findUniqueOrThrow({
        where: { id: request.user_id },
        select: { email: true, display_name: true, ui_locale: true },
      });
      await tx.user.update({
        where: { id: request.user_id },
        data: { email: request.new_email, email_verified_at: now },
        select: { id: true },
      });
      const stillOpen = { user_id: request.user_id, used_at: null };
      await tx.emailVerificationToken.updateMany({ where: stillOpen, data: { used_at: now } });
      await tx.passwordResetToken.updateMany({ where: stillOpen, data: { used_at: now } });
      return { email: before.email, displayName: before.display_name, uiLocale: before.ui_locale };
    });
    return previous ? { outcome: "changed", previous } : { outcome: "invalid" };
  } catch (error) {
    if (error instanceof EmailTakenOnConfirm || isUniqueViolation(error)) {
      return { outcome: "taken" };
    }
    throw error;
  }
}

/** Avviso email-changed al vecchio indirizzo dopo la conferma (T-3001): senza link e senza il nuovo indirizzo. */
export async function notifyEmailChanged(previous: PreviousIdentity): Promise<void> {
  if (!previous.email || !isEmailDeliveryAvailable()) {
    return;
  }

  await sendTemplateEmail({
    to: previous.email,
    template: "email-changed",
    locale: previous.uiLocale ?? DEFAULT_LOCALE,
    vars: { displayName: previous.displayName },
  });
}
