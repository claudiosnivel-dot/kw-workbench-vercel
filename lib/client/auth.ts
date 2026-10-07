import { type ErrorTranslator, readApiResponse } from "@/lib/client/http";

/** POST di accesso o registrazione con le credenziali (T-1303): una risposta non riuscita lancia l'errore del catalogo. */
export async function postCredentials(endpoint: string, body: Record<string, string>, tErrors: ErrorTranslator): Promise<void> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  await readApiResponse(response, tErrors);
}
