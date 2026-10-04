import { NextRequest, NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  getDecryptedGoogleSheetsRefreshToken,
  getGoogleSheetsCredentialRecord,
  upsertGoogleSheetsCredential,
} from "@/lib/integrations/google-sheets";
import { getGoogleSheetsApiConfig } from "@/lib/integrations/google-sheets-config";

const OAUTH_STATE_COOKIE = "kwb_google_sheets_oauth_state";
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
  const user = await requireAuthenticatedUserFromRequest(request);

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const redirectTarget = new URL("/personalizza", request.url);

  if (oauthError) {
    redirectTarget.searchParams.set("google_sheets", "error");
    redirectTarget.searchParams.set("reason", oauthError);
    return NextResponse.redirect(redirectTarget);
  }

  if (!code || !state || !stateCookie || state !== stateCookie) {
    redirectTarget.searchParams.set("google_sheets", "error");
    redirectTarget.searchParams.set("reason", "stato_non_valido");
    return NextResponse.redirect(redirectTarget);
  }

  const config = await getGoogleSheetsApiConfig();
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const redirectUri = config.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    redirectTarget.searchParams.set("google_sheets", "error");
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

    const existing = await getGoogleSheetsCredentialRecord(user.id);
    const fallbackRefreshToken = await getDecryptedGoogleSheetsRefreshToken(user.id);
    const refreshToken = tokenPayload.refresh_token || fallbackRefreshToken;

    if (!refreshToken) {
      throw new Error("Nessun refresh_token restituito. Riesegui il consenso con prompt=consent.");
    }

    const email = tokenPayload.access_token ? await fetchProfileEmail(tokenPayload.access_token) : undefined;

    await upsertGoogleSheetsCredential({
      userId: user.id,
      refreshToken,
      connectedEmail: email || existing?.connected_email || undefined,
      scope: tokenPayload.scope || existing?.scope || undefined,
      tokenType: tokenPayload.token_type || existing?.token_type || undefined,
    });

    redirectTarget.searchParams.set("google_sheets", "connected");
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
    redirectTarget.searchParams.set("google_sheets", "error");
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