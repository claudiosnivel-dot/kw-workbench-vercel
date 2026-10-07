import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { verifyLoginCredentials } from "@/lib/auth/credentials";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { hasAcceptedCurrentTerms } from "@/lib/legal/consent";

export const POST = withApiErrors(async (request: Request) => {
  if (!isAuthEnabled()) {
    return NextResponse.json({ success: true, authEnabled: false });
  }

  const payload = (await request.json()) as {
    email?: string;
    password?: string;
  };

  // Email inesistente e password errata: stesso status e stesso corpo (T-1401, CWE-204).
  const result = await verifyLoginCredentials(String(payload.email ?? ""), String(payload.password ?? ""));
  if (!result.user) {
    if (result.reason === "SUSPENDED") {
      return errorResponse(403, "ACCOUNT_SUSPENDED", "Account sospeso. Contatta l'amministratore.");
    }

    return errorResponse(401, "INVALID_CREDENTIALS", "Credenziali non valide");
  }

  // Termini non accettati nella versione corrente (T-1405): il form apre /accept-terms prima della pagina richiesta.
  const response = NextResponse.json(
    hasAcceptedCurrentTerms(result.user) ? { success: true } : { success: true, requiresTermsAcceptance: true }
  );
  await setSessionCookie(response, result.user);
  return response;
});