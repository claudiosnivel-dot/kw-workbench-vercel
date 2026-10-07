import { UserRole } from "@/lib/generated/prisma/enums";
import { type NextRequest, NextResponse } from "next/server";
import { EmailTakenError, registerUser } from "@/lib/auth/credentials";
import { readCredentialsRequest, registrationClosed } from "@/lib/auth/credentials-input";
import { issueVerificationToken, notifyExistingAccount } from "@/lib/auth/email-verification";
import { runAfterResponse } from "@/lib/http/after-response";
import { errorResponse, withApiErrors } from "@/lib/http/errors";
import { isSupportedLocale, LOCALE_COOKIE } from "@/lib/i18n/locale";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";

/** Esito della registrazione (T-1403): non è un errore, quindi il code non sta in API_ERROR_CODES. */
const CHECK_EMAIL_CODE = "CHECK_EMAIL";

/**
 * Registrazione pubblica (T-1401, T-1403, T-1405). Richiede l'accettazione dei termini correnti; poi risponde sempre
 * 202 CHECK_EMAIL con lo stesso corpo e senza cookie di sessione, per un'email nuova come per una già registrata
 * (CWE-204): un'email nuova crea l'utente e riceve verify-email, una esistente non modifica l'account e riceve
 * account-exists. Le email partono dopo la risposta; un loro fallimento non annulla la registrazione.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const closed = registrationClosed();
  if (closed) {
    return closed;
  }

  const read = await readCredentialsRequest(request);
  if ("invalid" in read) {
    return read.invalid;
  }

  const { payload, credentials } = read;
  if (payload.acceptTerms !== true) {
    return errorResponse(400, "TERMS_NOT_ACCEPTED", "Accetta termini e privacy per registrarti");
  }
  if (payload.termsVersion !== LEGAL_TERMS_VERSION) {
    return errorResponse(409, "TERMS_VERSION_CHANGED", "La versione dei termini è cambiata");
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  try {
    const user = await registerUser({
      ...credentials,
      role: UserRole.SUBSCRIBER,
      uiLocale: isSupportedLocale(cookieLocale) ? cookieLocale : null,
      // Sempre la costante del server, mai il valore inviato dal client (CWE-602).
      acceptedTermsVersion: LEGAL_TERMS_VERSION,
    });
    runAfterResponse("registration_email_failed", () => issueVerificationToken(user.id));
  } catch (error) {
    if (!(error instanceof EmailTakenError)) {
      throw error;
    }
    runAfterResponse("registration_email_failed", () => notifyExistingAccount(error.email));
  }

  return NextResponse.json({ code: CHECK_EMAIL_CODE }, { status: 202 });
});
