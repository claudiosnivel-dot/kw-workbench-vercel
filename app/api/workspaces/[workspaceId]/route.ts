import { NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { renameWorkspace } from "@/lib/workspaces/members";

type WorkspaceParams = { workspaceId: string };

/** Rinomina del workspace (T-1504): nome da 1 a 80 caratteri, ADMIN o superiore (workspace.update). */
export const PATCH = withUserRoute(async (request: Request, user, { workspaceId }: WorkspaceParams) => {
  const body = (await request.json()) as { name?: unknown } | null;
  return NextResponse.json({ data: await renameWorkspace(user, workspaceId, { name: body?.name }) });
});
