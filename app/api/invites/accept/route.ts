import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { setWorkspaceCookie } from "@/lib/authz/workspace";
import { withApiErrors } from "@/lib/http/errors";
import { acceptInvite } from "@/lib/workspaces/invites";

/**
 * Accettazione di un invito (T-1503): utente della sessione con l'email dell'invito, verificata; token monouso. Il
 * workspace in cui si entra diventa quello attivo.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const body = (await request.json()) as { token?: unknown } | null;
  const accepted = await acceptInvite(user, body?.token);

  const response = NextResponse.json({ data: accepted });
  setWorkspaceCookie(response, accepted.workspaceId);
  return response;
});
