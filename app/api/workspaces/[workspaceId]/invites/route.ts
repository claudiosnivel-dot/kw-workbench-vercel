import { NextRequest, NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { routeLocale } from "@/lib/i18n/route-locale";
import { createInvite } from "@/lib/workspaces/invites";

type WorkspaceParams = { workspaceId: string };

/**
 * Invito nel workspace (T-1503, T-3201): ADMIN o superiore; 201 con id, email, role, expiresAt, inviteUrl ed emailSent.
 * Il link con il token si vede solo qui, quindi no-store (CWE-524); l'email parte nella lingua di chi invita.
 */
export const POST = withUserRoute(async (request: NextRequest, user, { workspaceId }: WorkspaceParams) => {
  const body = (await request.json()) as { email?: unknown; role?: unknown } | null;
  const invite = await createInvite(user, workspaceId, { email: body?.email, role: body?.role }, routeLocale(request, user));
  return NextResponse.json({ data: invite }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
