import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth/credentials";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";

const SESSION_ENDED_PATH = "/api/auth/session-ended";

/**
 * Utente della pagina protetta: se il token non si risolve in un utente attivo (sospeso, eliminato o
 * revocato) si va a /api/auth/session-ended, che azzera il cookie e porta al login (T-502).
 */
export async function requirePageUser(): Promise<AuthUser> {
  const user = await getOptionalAuthenticatedUserFromCookies();
  if (!user) {
    redirect(SESSION_ENDED_PATH);
  }

  return user;
}
