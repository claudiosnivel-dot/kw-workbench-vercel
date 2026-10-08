import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { verifyLoginCredentials } from "@/lib/auth/credentials";
import { PASSWORD_CHANGE_PATH } from "@/lib/auth/current-user";
import { setSessionCookie } from "@/lib/auth/session-cookie";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { hasAcceptedCurrentTerms } from "@/lib/legal/consent";
import { getClientIp } from "@/lib/security/client-ip";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

export const POST = withApiErrors(async (request: Request) => {
  if (!isAuthEnabled()) {
    return NextResponse.json({ success: true, authEnabled: false });
  }

  const payload = (await request.json()) as {
    email?: string;
    password?: string;
  };

  // Rate limit per IP+email e per IP prima della verifica (T-1701, CWE-307): un tentativo bloccato non calcola l'hash.
  const ip = getClientIp(request);
  const rules = rateLimitRules();
  await enforceRateLimits([
    { key: `login:ip-email:${ip}:${String(payload.email ?? "").trim().toLowerCase()}`, rule: rules.loginIpEmail },
    { key: `login:ip:${ip}`, rule: rules.loginIp },
  ]);

  // Email inesistente e password errata: stesso status e stesso corpo (T-1401, CWE-204).
  const result = await verifyLoginCredentials(String(payload.email ?? ""), String(payload.password ?? ""));
  if (!result.user) {
    if (result.reason === "SUSPENDED") {
      return errorResponse(403, "ACCOUNT_SUSPENDED", "Account sospeso. Contatta l'amministratore.");
    }

    return errorResponse(401, "INVALID_CREDENTIALS", "Credenziali non valide");
  }

  // Password impostata da un admin (T-1704): sessione valida ma il form apre il cambio password obbligato. Termini non
  // accettati nella versione corrente (T-1405): il form apre /accept-terms prima della pagina richiesta.
  const response = NextResponse.json(
    result.user.mustChangePassword
      ? { success: true, code: "PASSWORD_CHANGE_REQUIRED", redirect: PASSWORD_CHANGE_PATH }
      : hasAcceptedCurrentTerms(result.user)
        ? { success: true }
        : { success: true, requiresTermsAcceptance: true }
  );
  await setSessionCookie(response, result.user);
  return response;
});