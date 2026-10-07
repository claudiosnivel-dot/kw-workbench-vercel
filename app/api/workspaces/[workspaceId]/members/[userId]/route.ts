import { NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { changeMemberRole, removeMember } from "@/lib/workspaces/members";

type MemberParams = { workspaceId: string; userId: string };

/** Cambio di ruolo di un membro (T-1503): ADMIN o MEMBER, da ADMIN o superiore; mai sull'ultimo OWNER. */
export const PATCH = withUserRoute(async (request: Request, user, { workspaceId, userId }: MemberParams) => {
  const body = (await request.json()) as { role?: unknown } | null;
  return NextResponse.json({ data: await changeMemberRole(user, workspaceId, userId, { role: body?.role }) });
});

/** Rimozione di un membro (T-1503): ADMIN o superiore; mai l'ultimo OWNER né il proprietario del workspace personale. */
export const DELETE = withUserRoute(async (request: Request, user, { workspaceId, userId }: MemberParams) => {
  await removeMember(user, workspaceId, userId);
  return NextResponse.json({ success: true });
});
