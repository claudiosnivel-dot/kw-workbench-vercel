import { NextRequest, NextResponse } from "next/server";
import { revokeAllSessions } from "@/lib/auth/credentials";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

/** «Esci da tutti i dispositivi»: incrementa session_version e azzera il cookie di questo dispositivo. */
export const POST = withApiErrors(async (request: NextRequest) => {
  // Uscire resta possibile anche durante il cambio password obbligato (T-1704).
  const user = await requireAuthenticatedUserFromRequest(request, { allowPendingPasswordChange: true });
  await revokeAllSessions(user.id);

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
});
