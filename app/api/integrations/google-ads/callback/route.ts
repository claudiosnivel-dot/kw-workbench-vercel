import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import { requireRootAdminUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  getDecryptedGoogleAdsRefreshToken,
  getGoogleAdsCredentialRecord,
  upsertGoogleAdsCredential,
} from "@/lib/integrations/google-ads";
import { getGoogleAdsApiConfig } from "@/lib/integrations/google-ads-config";

const OAUTH_STATE_COOKIE = "kwb_google_ads_oauth_state";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USER_INFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

async function fetchProfileEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(USER_INFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as { email?: string };
    return payload.email;
  } catch {
    return undefined;
  }
}

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireRootAdminUserFromRequest(request);

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const redirectTarget = new URL("/admin", request.url);

  if (oauthError) {
    redirectTarget.searchParams.set("google_ads", "error");
    redirectTarget.searchParams.set("reason", oauthError);
    return NextResponse.redirect(redirectTarget);
  }

  if (!code || !state || !stateCookie || state !== stateCookie) {
    redirectTarget.searchParams.set("google_ads", "error");
    redirectTarget.searchParams.set("reason", "stato_non_valido");
    return NextResponse.redirect(redirectTarget);
  }

  const config = await getGoogleAdsApiConfig();
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const redirectUri = config.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    redirectTarget.searchParams.set("google_ads", "error");
    redirectTarget.searchParams.set("reason", "config_oauth_mancante");
    return NextResponse.redirect(redirectTarget);
  }

  try {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok) {
      throw new Error(tokenPayload.error_description || tokenPayload.error || "Scambio token non riuscito");
    }

    const existing = await getGoogleAdsCredentialRecord();
    const fallbackRefreshToken = await getDecryptedGoogleAdsRefreshToken();
    const refreshToken = tokenPayload.refresh_token || fallbackRefreshToken;

    if (!refreshToken) {
      throw new Error("Nessun refresh_token restituito. Riesegui il consenso con prompt=consent.");
    }

    const email = tokenPayload.access_token ? await fetchProfileEmail(tokenPayload.access_token) : undefined;

    await upsertGoogleAdsCredential({
      refreshToken,
      connectedEmail: email || existing?.connected_email || undefined,
      scope: tokenPayload.scope || existing?.scope || undefined,
      tokenType: tokenPayload.token_type || existing?.token_type || undefined,
      customerId: existing?.customer_id || process.env.GOOGLE_ADS_CUSTOMER_ID || undefined,
      loginCustomerId: existing?.login_customer_id || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    });

    redirectTarget.searchParams.set("google_ads", "connected");
    const response = NextResponse.redirect(redirectTarget);
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(),
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    redirectTarget.searchParams.set("google_ads", "error");
    redirectTarget.searchParams.set("reason", error instanceof Error ? error.message : "sconosciuto");

    const response = NextResponse.redirect(redirectTarget);
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookies(),
      maxAge: 0,
      path: "/",
    });
    return response;
  }
});
