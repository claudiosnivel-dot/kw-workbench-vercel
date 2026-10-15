import { NextResponse } from "next/server";
import { cancelEmailChange, checkEmailChangeRequest, issueEmailChange } from "@/lib/account/email-change";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { runAfterResponse } from "@/lib/http/after-response";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Richiesta di cambio dell'email dell'utente della sessione (T-3001), con { newEmail, currentPassword }: 202 con la
 * richiesta come la mostra il Profilo, uguale anche quando l'indirizzo è già di un altro utente (CWE-204). Token e link
 * di conferma verso il nuovo indirizzo nascono dopo la risposta, così anche i tempi non cambiano (CWE-208); fino alla
 * conferma l'email resta quella di prima.
 */
export const POST = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const body = (await request.json()) as { newEmail?: unknown; currentPassword?: unknown } | null;
  const pending = await checkEmailChangeRequest(user, body ?? {});
  runAfterResponse("email_change_email_failed", () => issueEmailChange(user, pending.newEmail));

  return NextResponse.json({ data: { newEmail: pending.newEmail, expiresAt: pending.expiresAt.toISOString() } }, { status: 202 });
});

/** Annulla (T-3001): le richieste in attesa dell'utente della sessione non valgono più; 204 anche se non ce n'erano. */
export const DELETE = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  await cancelEmailChange(user.id);

  return new NextResponse(null, { status: 204 });
});
