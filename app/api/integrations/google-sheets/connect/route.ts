import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import { withApiErrors } from "@/lib/http/errors";
import {
  GOOGLE_SHEETS_OAUTH_STATE_COOKIE,
  GOOGLE_SHEETS_SCOPE,
  oauthPreflight,
} from "@/lib/integrations/google-sheets-oauth";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** Avvio del consenso Google Sheets; sessione scaduta o configurazione mancante tornano a Personalizza (T-906). */
export const GET = withApiErrors(async (request: Request) => {
  const preflight = await oauthPreflight(request);
  if (preflight instanceof NextResponse) {
    return preflight;
  }
  const { config } = preflight;

  const state = randomUUID();
  const url = new URL(GOOGLE_OAUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${GOOGLE_SHEETS_SCOPE} openid email`);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: GOOGLE_SHEETS_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
});
