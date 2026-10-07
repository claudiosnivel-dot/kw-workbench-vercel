import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { getRequestWorkspace } from "@/lib/authz/workspace";
import { withApiErrors } from "@/lib/http/errors";

/** Workspace dell'utente della sessione (T-1504): id, nome, ruolo, personale o no, e quale è attivo. */
export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { workspace, workspaces } = await getRequestWorkspace(user, request);
  return NextResponse.json({
    data: workspaces.map((item) => ({ ...item, active: item.id === workspace.id })),
  });
});
