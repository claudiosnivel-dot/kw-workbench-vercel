import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth/credentials";
import { getOptionalAuthenticatedUserFromCookies, PASSWORD_CHANGE_PATH } from "@/lib/auth/current-user";
import { PAGE_PATH_HEADER } from "@/lib/auth/safe-next-path";
import { hasAcceptedCurrentTerms, requireCurrentTerms } from "@/lib/legal/consent";

const SESSION_ENDED_PATH = "/api/auth/session-ended";

/**
 * Utente della pagina protetta: se il token non si risolve in un utente attivo (sospeso, eliminato o
 * revocato) si va a /api/auth/session-ended, che azzera il cookie e porta al login (T-502). Senza l'accettazione
 * dei termini correnti si va a /accept-terms con il percorso richiesto come next (T-1405). Con la password impostata da
 * un admin e non ancora cambiata ogni pagina porta a /account/password, tranne quella stessa pagina (T-1704).
 */
export async function requirePageUser(options: { allowPendingPasswordChange?: boolean } = {}): Promise<AuthUser> {
  const user = await getOptionalAuthenticatedUserFromCookies();
  if (!user) {
    redirect(SESSION_ENDED_PATH);
  }

  // Prima il cambio password, poi i termini: durante il cambio l'accettazione dei termini (un'API) non è ammessa.
  if (user.mustChangePassword) {
    if (!options.allowPendingPasswordChange) {
      redirect(PASSWORD_CHANGE_PATH);
    }
    return user;
  }

  if (!hasAcceptedCurrentTerms(user)) {
    requireCurrentTerms(user, (await headers()).get(PAGE_PATH_HEADER) ?? "/");
  }

  return user;
}
