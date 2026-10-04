import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Destinazione delle pagine protette quando la sessione non è più valida (T-502). Il cookie si azzera
 * solo se non si risolve in un utente attivo: un link esterno non può forzare il logout (CWE-352).
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await getOptionalAuthenticatedUserFromRequest(request);
  if (user) {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/login?reason=session_ended", request.url), 303);
  clearSessionCookie(response);
  return response;
});
