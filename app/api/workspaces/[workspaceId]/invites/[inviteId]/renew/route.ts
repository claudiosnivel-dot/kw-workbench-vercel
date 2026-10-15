import { NextRequest, NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { routeLocale } from "@/lib/i18n/route-locale";
import { renewInvite } from "@/lib/workspaces/invites";

type InviteParams = { workspaceId: string; inviteId: string };

/**
 * «Nuovo link» di un invito aperto, anche scaduto (T-3202): ADMIN o superiore; 200 con lo stesso corpo della creazione
 * e il nuovo link, che si vede solo qui (no-store); il vecchio link smette di valere.
 */
export const POST = withUserRoute(async (request: NextRequest, user, { workspaceId, inviteId }: InviteParams) => {
  const invite = await renewInvite(user, workspaceId, inviteId, routeLocale(request, user));
  return NextResponse.json({ data: invite }, { headers: { "Cache-Control": "no-store" } });
});
