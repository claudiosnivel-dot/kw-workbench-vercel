import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { getRequestWorkspace, setWorkspaceCookie } from "@/lib/authz/workspace";
import { withApiErrors } from "@/lib/http/errors";
import { createTeamWorkspace } from "@/lib/workspaces/members";

/** Workspace dell'utente della sessione (T-1504): id, nome, ruolo, personale o no, e quale è attivo. */
export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { workspace, workspaces } = await getRequestWorkspace(user, request);
  return NextResponse.json({
    data: workspaces.map((item) => ({ ...item, active: item.id === workspace.id })),
  });
});

/**
 * Nuovo workspace di squadra (T-2008): body { name }; il creatore è OWNER e il nuovo workspace diventa quello attivo
 * (cookie kwb_workspace). 400 VALIDATION_ERROR per un nome non valido, 409 WORKSPACE_LIMIT oltre il limite tecnico.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const workspace = await createTeamWorkspace(user, { name: body?.name });

  const response = NextResponse.json({ data: workspace }, { status: 201 });
  setWorkspaceCookie(response, workspace.id);
  return response;
});
