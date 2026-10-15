import { NextResponse } from "next/server";
import { confirmEmailChange, type EmailChangeConfirmation, notifyEmailChanged } from "@/lib/account/email-change";
import { runAfterResponse } from "@/lib/http/after-response";
import { errorResponse, withApiErrors } from "@/lib/http/errors";

const INVALID: EmailChangeConfirmation = { outcome: "invalid" };

/**
 * Conferma del cambio dell'email (T-3001), rotta pubblica: il token arriva nel body di una POST, mai da una GET. Token
 * inesistente, usato o scaduto: 410 con corpo identico nei tre casi; indirizzo preso da un altro utente nel frattempo:
 * 409 EMAIL_TAKEN senza modifiche. Dopo la conferma il vecchio indirizzo riceve l'avviso, dopo la risposta.
 */
export const POST = withApiErrors(async (request: Request) => {
  const { token } = ((await request.json()) ?? {}) as { token?: unknown };
  const confirmation = typeof token === "string" && token ? await confirmEmailChange(token) : INVALID;

  if (confirmation.outcome === "taken") {
    return errorResponse(409, "EMAIL_TAKEN", "Indirizzo già usato da un altro account");
  }
  if (confirmation.outcome === "invalid") {
    return errorResponse(410, "EMAIL_CHANGE_INVALID", "Link di cambio email non valido o scaduto");
  }

  const { previous } = confirmation;
  runAfterResponse("email_changed_notice_failed", () => notifyEmailChanged(previous));
  return NextResponse.json({ success: true });
});
