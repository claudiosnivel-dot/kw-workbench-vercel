import { NextRequest } from "next/server";
import { getOptionalAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import {
  getDecryptedGoogleSheetsRefreshToken,
  getGoogleSheetsCredentialRecord,
  upsertGoogleSheetsCredential,
} from "@/lib/integrations/google-sheets";
import { getGoogleSheetsApiConfig } from "@/lib/integrations/google-sheets-config";
import {
  GOOGLE_SHEETS_OAUTH_STATE_COOKIE,
  hasGrantedScope,
  oauthRedirect,
} from "@/lib/integrations/google-sheets-oauth";
import { logger } from "@/lib/observability/logger";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USER_INFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
};

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

/**
 * Callback del consenso Google Sheets (T-906): ogni uscita torna a Personalizza con un codice della whitelist e
 * cancella il cookie di state; la credenziale si salva solo se lo scope richiesto è tra quelli concessi.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  const user = await getOptionalAuthenticatedUserFromRequest(request);
  if (!user) {
    return oauthRedirect(request, { error: "sessione_scaduta" });
  }

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = request.cookies.get(GOOGLE_SHEETS_OAUTH_STATE_COOKIE)?.value;

  // Qualsiasi errore restituito da Google (consenso negato o altro): solo il codice, mai il testo ricevuto.
  if (url.searchParams.has("error")) {
    return oauthRedirect(request, { error: "accesso_negato" });
  }

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return oauthRedirect(request, { error: "stato_non_valido" });
  }

  const config = await getGoogleSheetsApiConfig();
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const redirectUri = config.redirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    return oauthRedirect(request, { error: "config_oauth_mancante" });
  }

  let tokenPayload: TokenPayload;
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
    tokenPayload = (await tokenResponse.json()) as TokenPayload;
    if (!tokenResponse.ok) {
      logger.warn("google_sheets_token_exchange_failed", { userId: user.id, status: tokenResponse.status, error: tokenPayload.error });
      return oauthRedirect(request, { error: "scambio_token_fallito" });
    }
  } catch (error) {
    logger.warn("google_sheets_token_exchange_failed", { userId: user.id, error });
    return oauthRedirect(request, { error: "scambio_token_fallito" });
  }

  // Con i permessi granulari l'utente può negare lo scope di Sheets: nessuna credenziale parziale.
  if (!hasGrantedScope(tokenPayload.scope)) {
    return oauthRedirect(request, { error: "scope_mancante" });
  }

  const existing = await getGoogleSheetsCredentialRecord(user.id);
  const refreshToken = tokenPayload.refresh_token || (await getDecryptedGoogleSheetsRefreshToken(user.id));
  if (!refreshToken) {
    return oauthRedirect(request, { error: "scambio_token_fallito" });
  }

  const email = tokenPayload.access_token ? await fetchProfileEmail(tokenPayload.access_token) : undefined;

  await upsertGoogleSheetsCredential({
    userId: user.id,
    refreshToken,
    connectedEmail: email || existing?.connected_email || undefined,
    scope: tokenPayload.scope || existing?.scope || undefined,
    tokenType: tokenPayload.token_type || existing?.token_type || undefined,
  });

  return oauthRedirect(request, "connected");
});
