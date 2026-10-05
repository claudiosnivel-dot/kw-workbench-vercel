// Gate di T-906 (AC-906-1…AC-906-4): flusso OAuth di Google Sheets con errori leggibili e codici in whitelist,
// scope concessi verificati, invalid_grant come «da ricollegare» e revoca del token alla disconnessione.
// Le API Google sono simulate con un fetch mockato.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as sheetsCallback } from "@/app/api/integrations/google-sheets/callback/route";
import { GET as sheetsConnect } from "@/app/api/integrations/google-sheets/connect/route";
import { POST as sheetsDisconnect } from "@/app/api/integrations/google-sheets/disconnect/route";
import { GET as sheetsSnapshot } from "@/app/api/integrations/google-sheets/route";
import { POST as exportToSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { resetEnvForTests } from "@/lib/env";
import { upsertGoogleSheetsCredential } from "@/lib/integrations/google-sheets";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const STATE_COOKIE = "kwb_google_sheets_oauth_state";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

type FetchCall = { url: string; method: string; body: string; contentType: string | null };

let calls: FetchCall[] = [];
let tokenResponse: () => Response = () => Response.json({ error: "non simulato" }, { status: 500 });
let revokeStatus = 200;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({
    url,
    method: init?.method ?? "GET",
    body: init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? ""),
    contentType: new Headers(init?.headers).get("content-type"),
  });
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    return tokenResponse();
  }
  if (url.startsWith(REVOKE_URL)) {
    return new Response(revokeStatus === 200 ? "{}" : '{"error":"server"}', { status: revokeStatus });
  }
  return Response.json({ error: "endpoint non simulato" }, { status: 404 });
});

function stubOAuthConfig() {
  vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_ID", "client-di-prova.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_SECRET", randomBytes(12).toString("hex"));
  vi.stubEnv("GOOGLE_SHEETS_OAUTH_REDIRECT_URI", "http://localhost:3000/api/integrations/google-sheets/callback");
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location") ?? "", "http://localhost:3000");
}

function callback(cookie: string, query: string) {
  return callRoute(sheetsCallback, {
    url: `/api/integrations/google-sheets/callback?${query}`,
    cookie: `${cookie}; ${STATE_COOKIE}=stato-valido`,
  });
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  resetEnvForTests();
  calls = [];
  revokeStatus = 200;
  tokenResponse = () => Response.json({ error: "non simulato" }, { status: 500 });
});

describe("OAuth Google Sheets", () => {
  // covers: AC-906-1
  it("connect senza configurazione reindirizza a Personalizza con il codice config_oauth_mancante", async () => {
    vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_SHEETS_OAUTH_REDIRECT_URI", "");
    const { cookie } = await createUserWithSession();

    const response = await callRoute(sheetsConnect, { url: "/api/integrations/google-sheets/connect", cookie });

    expect(response.status).toBe(302);
    const location = locationOf(response);
    expect(location.pathname + location.search).toBe("/personalizza?google_sheets=error&reason=config_oauth_mancante");
    expect(response.headers.get("content-type") ?? "").not.toContain("application/json");
  });

  // covers: AC-906-2
  it("la callback riduce gli errori a codici noti, verifica lo scope e cancella sempre il cookie di state", async () => {
    stubOAuthConfig();
    const { user, cookie } = await createUserWithSession();

    const denied = await callback(cookie, `error=${encodeURIComponent("<b>x</b>")}&state=stato-valido`);
    tokenResponse = () =>
      Response.json({ access_token: "access-di-prova", refresh_token: randomBytes(8).toString("hex"), scope: "openid email" });
    const missingScope = await callback(cookie, "code=codice&state=stato-valido");

    for (const [response, reason] of [
      [denied, "accesso_negato"],
      [missingScope, "scope_mancante"],
    ] as const) {
      expect(response.status).toBe(302);
      expect(locationOf(response).searchParams.get("reason")).toBe(reason);
      expect(response.headers.get("location")).not.toContain("<b>");
      expect(response.headers.get("location")).not.toContain("%3Cb%3E");
      expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${STATE_COOKIE}=;.*Max-Age=0`, "i"));
    }
    expect(await prisma.googleSheetsCredential.count({ where: { user_id: user.id } })).toBe(0);
  });

  // covers: AC-906-3
  it("invalid_grant al rinnovo del token porta l'export a 409 e la credenziale a reauth_required", async () => {
    stubOAuthConfig();
    const { user, cookie } = await createUserWithSession();
    await upsertGoogleSheetsCredential({ userId: user.id, refreshToken: randomBytes(8).toString("hex"), scope: "openid email" });
    const project = await prisma.project.create({ data: { name: "Sheets", owner_user_id: user.id } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    await prisma.keywordCandidate.create({
      data: {
        project_id: project.id,
        subproject_id: section.id,
        keyword: "moka express",
        normalized_keyword: "moka express",
        canonical_keyword: "moka express",
        source: "seed",
        source_query: "moka",
      },
    });
    tokenResponse = () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 });

    const exported = await callRoute(exportToSheets, {
      method: "POST",
      url: `/api/projects/${project.id}/export/google-sheets`,
      cookie,
      params: { id: project.id },
      body: { fileName: "Export", scope: "non-excluded" },
    });
    const snapshot = await callRoute(sheetsSnapshot, { url: "/api/integrations/google-sheets", cookie });

    expect(exported.status).toBe(409);
    expect(((await exported.json()) as { code?: string }).code).toBe("GOOGLE_REAUTH_REQUIRED");
    const credential = await prisma.googleSheetsCredential.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(credential.reauth_required_at).not.toBeNull();
    expect(((await snapshot.json()) as { data: { status: string } }).data.status).toBe("reauth_required");
  });

  // covers: AC-906-4
  it("la disconnessione revoca il refresh token e cancella la credenziale anche se la revoca fallisce", async () => {
    stubOAuthConfig();
    for (const [status, revoked] of [
      [200, true],
      [500, false],
    ] as const) {
      const { user, cookie } = await createUserWithSession();
      const refreshToken = randomBytes(8).toString("hex");
      await upsertGoogleSheetsCredential({ userId: user.id, refreshToken });
      calls = [];
      revokeStatus = status;

      const response = await callRoute(sheetsDisconnect, {
        method: "POST",
        url: "/api/integrations/google-sheets/disconnect",
        cookie,
      });

      const revokes = calls.filter((call) => call.url.startsWith(REVOKE_URL));
      expect(revokes).toHaveLength(1);
      expect(revokes[0].method).toBe("POST");
      expect(revokes[0].contentType).toBe("application/x-www-form-urlencoded");
      expect(new URLSearchParams(revokes[0].body).get("token")).toBe(refreshToken);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, revoked });
      expect(await prisma.googleSheetsCredential.count({ where: { user_id: user.id } })).toBe(0);
    }
  });
});
