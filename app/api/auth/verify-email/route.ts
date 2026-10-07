import { NextResponse } from "next/server";
import { consumeVerificationToken } from "@/lib/auth/email-verification";
import { errorResponse, withApiErrors } from "@/lib/http/errors";

/**
 * Conferma dell'email (T-1403), rotta pubblica: il token arriva nel body di una POST, mai consumato da una GET (gli
 * scanner dei link delle caselle di posta non lo bruciano). Token inesistente, scaduto o già usato: 400 con corpo
 * identico nei tre casi.
 */
export const POST = withApiErrors(async (request: Request) => {
  const body = (await request.json()) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";

  if (!token || !(await consumeVerificationToken(token))) {
    return errorResponse(400, "VERIFICATION_TOKEN_INVALID", "Link di verifica non valido o scaduto");
  }

  return NextResponse.json({ success: true });
});
