import { isAuthEnabled, isPublicSignupEnabled } from "@/lib/auth/config";
import { isCommercialLive } from "@/lib/billing/launch";
import { errorResponse } from "@/lib/http/errors";

type CredentialsInput = { email: string; displayName: string; password: string; confirmPassword: string };

/**
 * Registrazione pubblica aperta: APP_PUBLIC_SIGNUP_ENABLED e lancio commerciale attivo. In pausa (D-32, T-1606) gli
 * account li crea solo il root admin o nascono dagli inviti.
 */
export async function isPublicSignupOpen(): Promise<boolean> {
  return isPublicSignupEnabled() && (await isCommercialLive());
}

/** Registrazione pubblica chiusa: 400 con l'autenticazione disabilitata, 403 se chiusa (anche in pausa); null se aperta. */
export async function registrationClosed(): Promise<Response | null> {
  if (!isAuthEnabled()) {
    return errorResponse(400, "REGISTRATION_UNAVAILABLE", "Registrazione non disponibile con autenticazione disabilitata");
  }
  if (!(await isPublicSignupOpen())) {
    return errorResponse(403, "SIGNUP_DISABLED", "Registrazione pubblica disabilitata");
  }
  return null;
}

/**
 * Body JSON di registrazione e creazione utente (T-1303, T-1401): email e nome mostrato senza spazi ai bordi, password e
 * conferma, più il body intero per gli altri campi. Credenziali mancanti o conferma diversa: invalid, la risposta 400
 * con il code da restituire.
 */
export async function readCredentialsRequest(
  request: Request
): Promise<{ payload: Record<string, unknown>; credentials: CredentialsInput } | { invalid: Response }> {
  const payload = (await request.json()) as Record<string, unknown>;
  const credentials: CredentialsInput = {
    email: String(payload.email ?? "").trim(),
    displayName: String(payload.displayName ?? "").trim(),
    password: String(payload.password ?? ""),
    confirmPassword: String(payload.confirmPassword ?? ""),
  };

  if (!credentials.email || !credentials.password) {
    return { invalid: errorResponse(400, "CREDENTIALS_REQUIRED", "Email e password sono obbligatorie") };
  }
  if (credentials.password !== credentials.confirmPassword) {
    return { invalid: errorResponse(400, "PASSWORD_MISMATCH", "Password e conferma non coincidono") };
  }
  return { payload, credentials };
}
