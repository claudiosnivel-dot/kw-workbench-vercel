import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import {
  AuthRequiredError,
  ForbiddenError,
  requireRootAdminUserFromRequest,
} from "@/lib/auth/current-user";
import { getGoogleAdsApiConfig } from "@/lib/integrations/google-ads-config";

const OAUTH_STATE_COOKIE = "kwb_google_ads_oauth_state";
const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function toResponseError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "Operazione riservata al root admin" }, { status: 403 });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : "Errore interno" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireRootAdminUserFromRequest(request);

    const config = await getGoogleAdsApiConfig();
    const clientId = config.clientId;
    const redirectUri = config.redirectUri;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        {
          error: "Configurazione OAuth Google Ads mancante. Imposta Client ID e Redirect URI in Admin > Google Keyword Planner.",
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
  } catch (error) {
    return toResponseError(error);
  }
}
