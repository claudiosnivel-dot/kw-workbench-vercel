import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { requireWorkspaceRole, setWorkspaceCookie } from "@/lib/authz/workspace";
import { withApiErrors } from "@/lib/http/errors";

/**
 * Sceglie il workspace attivo (T-1504): 404 WORKSPACE_NOT_FOUND se l'utente non ne è membro, altrimenti cookie
 * kwb_workspace e 204. Il cookie resta una preferenza: pagine e rotte riverificano la membership (CWE-565).
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const body = (await request.json()) as { workspaceId?: unknown } | null;
  const workspace = await requireWorkspaceRole(user, body?.workspaceId, "workspace.read");

  const response = new NextResponse(null, { status: 204 });
  setWorkspaceCookie(response, workspace.id);
  return response;
});
