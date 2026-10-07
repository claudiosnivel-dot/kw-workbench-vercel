import { createHash, randomBytes } from "node:crypto";
import type { Prisma, UiLocale } from "@/lib/generated/prisma/client";
import { sendTemplateEmail } from "@/lib/email";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";

/**
 * Tabella di token monouso (email_verification_tokens, password_reset_tokens), con i soli metodi usati qui: le due
 * tabelle hanno le stesse colonne, quindi emissione e consumo sono gli stessi.
 */
type OneTimeTokenTable = {
  updateMany(args: {
    where: { user_id?: string; token_hash?: string; used_at: null; expires_at?: { gt: Date } };
    data: { used_at: Date };
  }): Promise<{ count: number }>;
  create(args: { data: { user_id: string; token_hash: string; created_at: Date; expires_at: Date } }): Promise<unknown>;
  findUniqueOrThrow(args: { where: { token_hash: string }; select: { user_id: true } }): Promise<{ user_id: string }>;
};

/** Delegate Prisma delle due tabelle di token. */
type TokenTableName = "emailVerificationToken" | "passwordResetToken";

/** SHA-256 esadecimale del token: è l'unica forma salvata nel DB (T-1403, T-1404). */
function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Nuovo token monouso (T-1403, T-1404): 32 byte da crypto.randomBytes in base64url (CWE-330), nel DB solo l'hash con la
 * scadenza; i token non usati precedenti dell'utente diventano inutilizzabili (used_at). Istanti dal clock dell'app,
 * non dal DB: scadenze e limiti di reinvio si confrontano con lo stesso clock.
 */
async function storeOneTimeToken(table: OneTimeTokenTable, userId: string, ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await table.updateMany({ where: { user_id: userId, used_at: null }, data: { used_at: now } });
  await table.create({
    data: { user_id: userId, token_hash: hashOneTimeToken(token), created_at: now, expires_at: new Date(now.getTime() + ttlMs) },
  });
  return token;
}

/**
 * Emette il token e invia l'email del template con il link, nella lingua dell'utente (fallback it). Il token in chiaro
 * esiste solo nel link dell'email, mai nel DB né nei log.
 */
export async function sendOneTimeTokenEmail(input: {
  table: TokenTableName;
  ttlMs: number;
  template: "verify-email" | "password-reset";
  user: { id: string; email: string; display_name: string; ui_locale: UiLocale | null };
}): Promise<void> {
  const { user } = input;
  const token = await prisma.$transaction((tx) => storeOneTimeToken(tx[input.table], user.id, input.ttlMs));
  await sendTemplateEmail({
    to: user.email,
    template: input.template,
    locale: user.ui_locale ?? DEFAULT_LOCALE,
    vars: { displayName: user.display_name, token },
  });
}

/**
 * Consumo atomico del token (T-1403, T-1404, CWE-367): un solo updateMany condizionale (hash, non usato, non scaduto) e
 * solo con count 1, nella stessa transazione, l'effetto sull'utente: data (se presente) ed email_verified_at impostato
 * se nullo, perché il link prova il possesso dell'email. false se il token è inesistente, scaduto o già usato.
 */
export async function redeemOneTimeToken(table: TokenTableName, token: string, data?: Prisma.UserUpdateInput): Promise<boolean> {
  const tokenHash = hashOneTimeToken(token);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const tokens: OneTimeTokenTable = tx[table];
    const { count } = await tokens.updateMany({
      where: { token_hash: tokenHash, used_at: null, expires_at: { gt: now } },
      data: { used_at: now },
    });
    if (count !== 1) {
      return false;
    }

    const { user_id: userId } = await tokens.findUniqueOrThrow({ where: { token_hash: tokenHash }, select: { user_id: true } });
    if (data) {
      await tx.user.update({ where: { id: userId }, data, select: { id: true } });
    }
    await tx.user.updateMany({ where: { id: userId, email_verified_at: null }, data: { email_verified_at: now } });
    return true;
  });
}
