import type { AuthUser } from "@/lib/auth/credentials";
import { AppError } from "@/lib/http/errors";

/**
 * Email verificata richiesta lato server (T-1403, CWE-285): le rotte di avvio delle estrazioni rispondono 403
 * EMAIL_NOT_VERIFIED a un utente non verificato, che resta libero di usare il resto dell'app. T-1602 lo applica al
 * checkout.
 */
export function requireVerifiedEmail(user: AuthUser): void {
  if (!user.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verifica la tua email prima di avviare un'estrazione");
  }
}
