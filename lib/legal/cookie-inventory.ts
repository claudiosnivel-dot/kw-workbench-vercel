/**
 * Inventario dei cookie impostati dall'app (T-1803), base della cookie policy di D-15. Oggi sono tutti tecnici, quindi
 * nessun banner cookie; tests/tooling/cookie-inventory.test.ts fallisce se il codice imposta un cookie assente da qui.
 * Cookie di terze parti, non impostati dall'app e da confermare per la cookie policy: Paddle.js nell'overlay del
 * checkout (T-1602; cataloghi di terzi citano paddle_checkout, paddle_session e _paddle_ref) e Cloudflare Turnstile
 * (T-1702; secondo Cloudflare nessun cookie persistente). Nessuno dei due è attivo finché il lancio è in pausa (D-32).
 */
export type CookieCategory = "technical";

export type CookieInventoryEntry = { name: string; category: CookieCategory; purpose: string; duration: string };

export const COOKIE_INVENTORY: readonly CookieInventoryEntry[] = [
  {
    name: "kwb_session",
    category: "technical",
    purpose: "Sessione di accesso firmata e revocabile (T-501)",
    duration: "APP_SESSION_MAX_AGE_SECONDS, 7 giorni di default",
  },
  {
    name: "kwb_workspace",
    category: "technical",
    purpose: "Workspace attivo dell'utente autenticato (T-1504)",
    duration: "1 anno",
  },
  {
    name: "kwb_locale",
    category: "technical",
    purpose: "Lingua scelta con il selettore (T-1301)",
    duration: "1 anno",
  },
  {
    name: "kwb_google_sheets_oauth_state",
    category: "technical",
    purpose: "Stato anti-CSRF del collegamento OAuth a Google Sheets (T-906)",
    duration: "10 minuti",
  },
];
