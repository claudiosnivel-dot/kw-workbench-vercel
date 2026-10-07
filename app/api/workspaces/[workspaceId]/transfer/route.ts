import { NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { transferOwnership } from "@/lib/workspaces/members";

type WorkspaceParams = { workspaceId: string };

/** Trasferimento della proprietà (T-1503): solo l'OWNER, verso un membro; il cedente diventa ADMIN. */
export const POST = withUserRoute(async (request: Request, user, { workspaceId }: WorkspaceParams) => {
  const body = (await request.json()) as { userId?: unknown } | null;
  return NextResponse.json({ data: await transferOwnership(user, workspaceId, { userId: body?.userId }) });
});
