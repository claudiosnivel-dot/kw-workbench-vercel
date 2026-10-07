import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { runAfterResponse } from "@/lib/http/after-response";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Richiesta di recupero password (T-1404), rotta pubblica: risponde sempre 202 { ok: true } con lo stesso corpo;
 * ricerca dell'utente, token e invio avvengono dopo la risposta, così né il corpo né il tempo di risposta rivelano
 * se l'email ha un account (CWE-204, CWE-208).
 */
export const POST = withApiErrors(async (request: Request) => {
  const body = (await request.json()) as { email?: unknown } | null;
  const email = String(body?.email ?? "");

  runAfterResponse("password_reset_request_failed", () => requestPasswordReset(email));
  return NextResponse.json({ ok: true }, { status: 202 });
});
