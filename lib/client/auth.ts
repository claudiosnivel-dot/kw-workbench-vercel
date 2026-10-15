import { type ErrorTranslator, readApiResponse, sendJson } from "@/lib/client/http";

/**
 * Risposta riuscita del login: requiresTermsAcceptance se i termini correnti non sono ancora accettati (T-1405); code
 * PASSWORD_CHANGE_REQUIRED con redirect dopo un reset della password da parte di un admin (T-1704).
 */
export type CredentialsResponse = { requiresTermsAcceptance?: boolean; code?: string; redirect?: string };

/** POST di accesso o registrazione con le credenziali (T-1303): una risposta non riuscita lancia l'errore del catalogo. */
export async function postCredentials(
  endpoint: string,
  body: Record<string, unknown>,
  tErrors: ErrorTranslator
): Promise<CredentialsResponse | null> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return readApiResponse<CredentialsResponse>(response, tErrors);
}

/**
 * PATCH /api/auth/config (T-2802): il solo nome mostrato dal Profilo, oppure la password attuale con la nuova e la
 * conferma dalla sezione Accesso. Una risposta non riuscita lancia l'errore del catalogo.
 */
export async function patchAuthConfig(
  body: { displayName: string } | { currentPassword: string; newPassword: string; confirmPassword: string },
  tErrors: ErrorTranslator
): Promise<{ data?: { displayName: string } } | null> {
  return readApiResponse(await sendJson("PATCH", "/api/auth/config", body), tErrors);
}
