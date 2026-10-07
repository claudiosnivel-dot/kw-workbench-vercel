import { NextRequest, NextResponse } from "next/server";
import { withUserRoute } from "@/lib/http/user-route";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/locale";
import { createInvite } from "@/lib/workspaces/invites";

type WorkspaceParams = { workspaceId: string };

/**
 * Invito nel workspace (T-1503): ADMIN o superiore; 201 con id, email, role ed expiresAt, mai il token. L'email parte
 * nella lingua di chi invita.
 */
export const POST = withUserRoute(async (request: NextRequest, user, { workspaceId }: WorkspaceParams) => {
  const body = (await request.json()) as { email?: unknown; role?: unknown } | null;
  const locale = resolveLocale({
    userLocale: user.uiLocale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  const invite = await createInvite(user, workspaceId, { email: body?.email, role: body?.role }, locale);
  return NextResponse.json({ data: invite }, { status: 201 });
});
