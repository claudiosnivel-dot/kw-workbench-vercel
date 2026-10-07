import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { issueVerificationToken, verificationResendRetryAfter } from "@/lib/auth/email-verification";
import { EmailDeliveryError } from "@/lib/email/types";
import { errorResponse, withApiErrors } from "@/lib/http/errors";

/**
 * Nuovo invio dell'email di verifica (T-1403), solo con sessione: 409 se l'email è già verificata, 429 con Retry-After
 * oltre 1 invio ogni 60 s o 5 nelle ultime 24 h per utente (CWE-799; il limite per IP è di T-1701); 503
 * EMAIL_UNAVAILABLE se l'invio non riesce.
 */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  if (user.emailVerified) {
    return errorResponse(409, "EMAIL_ALREADY_VERIFIED", "Email già verificata");
  }

  const retryAfter = await verificationResendRetryAfter(user.id);
  if (retryAfter > 0) {
    const limited = errorResponse(429, "RATE_LIMITED", "Troppe richieste di invio: riprova più tardi");
    limited.headers.set("Retry-After", String(retryAfter));
    return limited;
  }

  try {
    await issueVerificationToken(user.id);
  } catch (error) {
    // Invio non riuscito o Resend non ancora configurato (D-11 emendata): già registrato dal mittente.
    if (error instanceof EmailDeliveryError) {
      return errorResponse(503, "EMAIL_UNAVAILABLE", "Invio delle email non disponibile");
    }
    throw error;
  }
  return NextResponse.json({ success: true });
});
