import type { Prisma } from "@/lib/generated/prisma/client";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";

// Utente seed degli E2E: la password è un valore di test, mai una credenziale reale.
// impacted-by: T-1401 (accesso con l'email; il nome mostrato resta e2e-user)
export const E2E_EMAIL = "e2e-user@example.test";
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "e2e-password-not-real";

/**
 * Utente degli E2E con email verificata e termini correnti accettati (T-1403, T-1405), come un account già attivo:
 * nome mostrato uguale alla parte locale dell'email. data aggiunge o sostituisce i campi (ruolo, lingua, date).
 */
export async function createE2EUser(email: string, password: string, data: Partial<Prisma.UserCreateInput> = {}) {
  return prisma.user.create({
    data: {
      email,
      display_name: email.slice(0, email.indexOf("@")),
      password_hash: await hashPassword(password),
      email_verified_at: new Date(),
      accepted_terms_version: LEGAL_TERMS_VERSION,
      ...data,
    },
  });
}
