import { NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { revokeInvite } from "@/lib/workspaces/invites";

type InviteParams = { workspaceId: string; inviteId: string };

/** Revoca di un invito pendente (T-1503): ADMIN o superiore. */
export const DELETE = withUserRoute(async (request: Request, user, { workspaceId, inviteId }: InviteParams) => {
  return NextResponse.json({ data: await revokeInvite(user, workspaceId, inviteId) });
});
