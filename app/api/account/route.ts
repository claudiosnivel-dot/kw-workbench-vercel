import { NextResponse } from "next/server";
import { deleteOwnAccount } from "@/lib/account/delete";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { clearSessionCookie } from "@/lib/auth/session-cookie";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Cancellazione dell'account dell'utente della sessione (T-1804): richiede la password attuale nel corpo { password }.
 * Nessun id dal client (CWE-639); a cancellazione avvenuta il cookie di sessione viene azzerato.
 */
export const DELETE = withApiErrors(async (request: Request) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  await deleteOwnAccount(user, body?.password);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
});
