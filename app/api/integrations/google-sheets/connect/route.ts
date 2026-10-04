import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { getGoogleSheetsApiConfig } from "@/lib/integrations/google-sheets-config";

const OAUTH_STATE_COOKIE = "kwb_google_sheets_oauth_state";
const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const GET = withApiErrors(async (request: Request) => {
  await requireAuthenticatedUserFromRequest(request);

  const config = await getGoogleSheetsApiConfig();
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const redirectUri = config.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error: "Configurazione OAuth Google Sheets mancante. Contatta l'admin principale.",
      },
      { status: 400 }
    );
  }

  const state = randomUUID();
  const url = new URL(GOOGLE_OAUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/spreadsheets openid email");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
});