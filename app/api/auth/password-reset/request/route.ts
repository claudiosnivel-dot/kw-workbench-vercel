import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { runAfterResponse } from "@/lib/http/after-response";
import { withApiErrors } from "@/lib/http/errors";
import { guardPublicForm } from "@/lib/security/captcha";

/**
 * Richiesta di recupero password (T-1404), rotta pubblica: risponde sempre 202 { ok: true } con lo stesso corpo;
 * ricerca dell'utente, token e invio avvengono dopo la risposta, così né il corpo né il tempo di risposta rivelano
 * se l'email ha un account (CWE-204, CWE-208). Prima: rate limit per email e per IP (T-1701), poi CAPTCHA (T-1702); le
 * chiavi dipendono solo dal testo dell'email, mai dall'esistenza dell'account.
 */
export const POST = withApiErrors(async (request: Request) => {
  const body = (await request.json()) as { email?: unknown; turnstileToken?: unknown } | null;
  const email = String(body?.email ?? "");
  await guardPublicForm(request, {
    action: "password-reset",
    token: body?.turnstileToken,
    limits: (ip, rules) => [
      { key: `reset:email:${email.trim().toLowerCase()}`, rule: rules.resetEmail },
      { key: `reset:ip:${ip}`, rule: rules.resetIp },
    ],
  });

  runAfterResponse("password_reset_request_failed", () => requestPasswordReset(email));
  return NextResponse.json({ ok: true }, { status: 202 });
});
