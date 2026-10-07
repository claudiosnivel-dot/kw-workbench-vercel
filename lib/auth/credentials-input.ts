import { isAuthEnabled, isPublicSignupEnabled } from "@/lib/auth/config";
import { errorResponse } from "@/lib/http/errors";

export type CredentialsInput = { username: string; password: string; confirmPassword: string };

/** Username (senza spazi ai bordi), password e conferma dal body di registrazione e creazione utente. */
export function readCredentialsInput(payload: {
  username?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}): CredentialsInput {
  return {
    username: String(payload.username ?? "").trim(),
    password: String(payload.password ?? ""),
    confirmPassword: String(payload.confirmPassword ?? ""),
  };
}

/** Registrazione pubblica chiusa: 400 con l'autenticazione disabilitata, 403 se disabilitata; null se aperta. */
export function registrationClosed(): Response | null {
  if (!isAuthEnabled()) {
    return errorResponse(400, "REGISTRATION_UNAVAILABLE", "Registrazione non disponibile con autenticazione disabilitata");
  }
  if (!isPublicSignupEnabled()) {
    return errorResponse(403, "SIGNUP_DISABLED", "Registrazione pubblica disabilitata");
  }
  return null;
}

/** 400 con il code per credenziali mancanti o conferma diversa (T-1303); null se l'input è completo. */
export function credentialsInputError({ username, password, confirmPassword }: CredentialsInput): Response | null {
  if (!username || !password) {
    return errorResponse(400, "CREDENTIALS_REQUIRED", "Username e password sono obbligatori");
  }
  if (password !== confirmPassword) {
    return errorResponse(400, "PASSWORD_MISMATCH", "Password e conferma non coincidono");
  }
  return null;
}
