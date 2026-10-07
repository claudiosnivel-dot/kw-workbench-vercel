import { NextResponse } from "next/server";
import { confirmPasswordReset } from "@/lib/auth/password-reset";
import { errorResponse, withApiErrors } from "@/lib/http/errors";

/**
 * Conferma del recupero password (T-1404), rotta pubblica. Token inesistente, scaduto o già usato: 400 con corpo
 * identico nei tre casi. Nessun cookie di sessione dopo il reset: l'utente accede con la nuova password.
 */
export const POST = withApiErrors(async (request: Request) => {
  const body = (await request.json()) as { token?: unknown; password?: unknown; confirmPassword?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const password = String(body?.password ?? "");

  if (password !== String(body?.confirmPassword ?? "")) {
    return errorResponse(400, "PASSWORD_MISMATCH", "Password e conferma non coincidono");
  }

  // Password troppo corta: 400 VALIDATION_ERROR da confirmPasswordReset, prima di consumare il token.
  if (!token || !(await confirmPasswordReset(token, password))) {
    return errorResponse(400, "RESET_TOKEN_INVALID", "Link di reimpostazione non valido o scaduto");
  }

  return NextResponse.json({ success: true });
});
