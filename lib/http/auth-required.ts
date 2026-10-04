// Nessun import: il modulo serve al proxy, ai route handler (via withApiErrors) e al client (lib/client/http.ts).

export const AUTH_REQUIRED_CODE = "AUTH_REQUIRED";
export const AUTH_REQUIRED_MESSAGE = "Sessione non valida o scaduta. Effettua di nuovo il login.";

/** Unica risposta 401 per sessione assente, scaduta o revocata (T-502): proxy e withApiErrors (T-503). */
export function authRequiredResponse(extra: { requestId?: string } = {}): Response {
  return Response.json({ error: AUTH_REQUIRED_MESSAGE, code: AUTH_REQUIRED_CODE, ...extra }, { status: 401 });
}
