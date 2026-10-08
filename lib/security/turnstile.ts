/**
 * Voce captcha della checklist del lancio commerciale (T-1606, D-32): chiavi Cloudflare Turnstile
 * (TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY) presenti e non di test in production, con la verifica lato
 * server collegata a registrazione e recupero password. Quella verifica è di T-1702, non ancora costruito: la voce resta
 * mancante anche con le chiavi impostate (mai verde) finché T-1702 non sostituisce questo controllo.
 */
export function isTurnstileReady(): boolean {
  return false;
}
