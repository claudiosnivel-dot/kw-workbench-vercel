import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";

/**
 * Consenso a termini e privacy (T-1405). Il gate riguarda solo le pagine: requirePageUser lo applica a ogni pagina
 * dell'app, mentre le API JSON non sono bloccate (un client API non può mostrare la pagina di accettazione; il login
 * segnala requiresTermsAcceptance e il form porta a /accept-terms). Scelta voluta, non una dimenticanza.
 */
export function hasAcceptedCurrentTerms(user: { acceptedTermsVersion: string | null }): boolean {
  return user.acceptedTermsVersion === LEGAL_TERMS_VERSION;
}

/**
 * Senza l'accettazione della versione corrente reindirizza a /accept-terms?next=<percorso>, con il percorso ridotto
 * alla stessa origine da safeNextPath (T-303, CWE-601).
 */
export function requireCurrentTerms(user: { acceptedTermsVersion: string | null }, path: string): void {
  if (!hasAcceptedCurrentTerms(user)) {
    redirect(`/accept-terms?next=${encodeURIComponent(safeNextPath(path))}`);
  }
}
