import { type ErrorTranslator, readApiResponse } from "@/lib/client/http";

/** Risposta riuscita del login (T-1405): requiresTermsAcceptance se i termini correnti non sono ancora accettati. */
export type CredentialsResponse = { requiresTermsAcceptance?: boolean };

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
