import { NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { leaveWorkspace } from "@/lib/workspaces/members";

type WorkspaceParams = { workspaceId: string };

/** Abbandono del workspace (T-1503): 409 LAST_OWNER per l'ultimo OWNER e per il workspace personale. */
export const POST = withUserRoute(async (request: Request, user, { workspaceId }: WorkspaceParams) => {
  await leaveWorkspace(user, workspaceId);
  return NextResponse.json({ success: true });
});
