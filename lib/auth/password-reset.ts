import { UserStatus } from "@/lib/generated/prisma/enums";
import { validatePassword } from "@/lib/auth/credentials";
import { normalizeEmail } from "@/lib/auth/email-address";
import { redeemOneTimeToken, sendOneTimeTokenEmail } from "@/lib/auth/one-time-token";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Richiesta di reset (T-1404), eseguita dopo la risposta: token valido 1 h e invio di password-reset solo a un utente
 * attivo con email; email inesistenti, utenti legacy senza email e sospesi non ricevono nulla. Una nuova richiesta
 * rende inutilizzabili i token non usati precedenti dello stesso utente.
 */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = email
    ? await prisma.user.findUnique({ where: { email }, select: { id: true, display_name: true, ui_locale: true, status: true } })
    : null;
  if (!email || !user || user.status !== UserStatus.ACTIVE) {
    return;
  }

  await sendOneTimeTokenEmail({ table: "passwordResetToken", ttlMs: RESET_TTL_MS, template: "password-reset", user: { ...user, email } });
}

/**
 * Conferma del reset (T-1404): password validata (400 VALIDATION_ERROR prima di consumare il token), poi nella stessa
 * transazione del consumo nuovo hash e session_version incrementato (ogni sessione esistente decade, CWE-613);
 * email_verified_at impostato se nullo. false se il token è inesistente, scaduto o già usato.
 */
export async function confirmPasswordReset(token: string, password: string): Promise<boolean> {
  const passwordHash = await hashPassword(validatePassword(password));
  return redeemOneTimeToken("passwordResetToken", token, {
    password_hash: passwordHash,
    session_version: { increment: 1 },
  });
}
