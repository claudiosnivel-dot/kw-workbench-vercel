import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";

// Flusso OAuth di Google Sheets (T-906): costanti condivise da connect e callback e uscite di errore leggibili.

export const GOOGLE_SHEETS_OAUTH_STATE_COOKIE = "kwb_google_sheets_oauth_state";

/**
 * Scope richiesto da connect e verificato dalla callback tra quelli concessi (permessi granulari). drive.file
 * (Recommended, Non-sensitive) basta perché l'export crea solo file nuovi e scrive solo su quelli (T-907):
 * https://developers.google.com/workspace/sheets/api/scopes
 */
export const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Codici ammessi nel parametro reason: mai testo di Google o di un'eccezione nell'URL (CWE-79). */
export type GoogleSheetsOAuthReason =
  | "accesso_negato"
  | "stato_non_valido"
  | "config_oauth_mancante"
  | "scope_mancante"
  | "scambio_token_fallito"
  | "sessione_scaduta";

/** Cookie di state cancellato: va su ogni risposta della callback, anche di errore. */
export function clearOAuthStateCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: GOOGLE_SHEETS_OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge: 0,
    path: "/",
  });
  return response;
}

/** Redirect a Personalizza con l'esito del collegamento; il cookie di state è sempre cancellato. */
export function oauthRedirect(request: Request, outcome: { error: GoogleSheetsOAuthReason } | "connected"): NextResponse {
  const target = new URL("/personalizza", request.url);
  if (outcome === "connected") {
    target.searchParams.set("google_sheets", "connected");
  } else {
    target.searchParams.set("google_sheets", "error");
    target.searchParams.set("reason", outcome.error);
  }
  return clearOAuthStateCookie(NextResponse.redirect(target, 302));
}

/** Il campo scope della risposta token (scope separati da spazio) contiene lo scope richiesto. */
export function hasGrantedScope(granted: string | undefined, required: string = GOOGLE_SHEETS_SCOPE): boolean {
  return (granted ?? "").split(/\s+/).includes(required);
}
