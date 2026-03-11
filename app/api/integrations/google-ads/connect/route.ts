import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import { getGoogleAdsApiConfig } from "@/lib/integrations/google-ads-config";

const OAUTH_STATE_COOKIE = "kwb_google_ads_oauth_state";
const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET() {
  const config = await getGoogleAdsApiConfig();
  const clientId = config.clientId;
  const redirectUri = config.redirectUri;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error: "Configurazione OAuth Google Ads mancante. Imposta Client ID e Redirect URI in Integrazioni > Configurazione API Google Ads.",
      },
      { status: 400 }
    );
  }

  const state = randomUUID();
  const url = new URL(GOOGLE_OAUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords openid email");
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
}