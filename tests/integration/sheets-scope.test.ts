// Gate di T-907 (AC-907-1…AC-907-4): Google Sheets con lo scope minimo drive.file. Le API Google sono simulate
// con un fetch mockato; la prova con un account Google reale resta all'utente.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as sheetsCallback } from "@/app/api/integrations/google-sheets/callback/route";
import { GET as sheetsConnect } from "@/app/api/integrations/google-sheets/connect/route";
import { GET as sheetsSnapshot } from "@/app/api/integrations/google-sheets/route";
import { POST as exportToSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { resetEnvForTests } from "@/lib/env";
import { upsertGoogleSheetsCredential } from "@/lib/integrations/google-sheets";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SPREADSHEET_ID = "S1";

const googleCalls: { method: string; url: string }[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  googleCalls.push({ method, url });
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    const grant = init?.body instanceof URLSearchParams ? init.body.get("grant_type") : null;
    return Response.json(
      grant === "authorization_code"
        ? { access_token: "access-di-prova", refresh_token: randomBytes(8).toString("hex"), scope: `openid email ${DRIVE_FILE_SCOPE}` }
        : { access_token: "access-di-prova", token_type: "Bearer" }
    );
  }
  if (url.startsWith("https://openidconnect.googleapis.com/")) {
    return Response.json({ email: "utente@example.com" });
  }
  if (url === "https://sheets.googleapis.com/v4/spreadsheets" && method === "POST") {
    return Response.json({ spreadsheetId: SPREADSHEET_ID, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit` });
  }
  if (url.includes(`/${SPREADSHEET_ID}/values:batchUpdate`) || url.includes(`/${SPREADSHEET_ID}:batchUpdate`)) {
    return Response.json({ spreadsheetId: SPREADSHEET_ID });
  }
  return Response.json({ error: "endpoint non simulato" }, { status: 404 });
});

function snapshotOf(cookie: string) {
  return callRoute(sheetsSnapshot, { url: "/api/integrations/google-sheets", cookie }).then(
    async (response) => ((await response.json()) as { data: { needsReconnect: boolean; status: string } }).data
  );
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
  vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_ID", "client-di-prova.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_SECRET", randomBytes(12).toString("hex"));
  vi.stubEnv("GOOGLE_SHEETS_OAUTH_REDIRECT_URI", "http://localhost:3000/api/integrations/google-sheets/callback");
  resetEnvForTests();
  googleCalls.length = 0;
});

describe("Google Sheets con scope drive.file", () => {
  // covers: AC-907-1
  it("connect chiede drive.file e non più spreadsheets", async () => {
    const { cookie } = await createUserWithSession();

    const response = await callRoute(sheetsConnect, { url: "/api/integrations/google-sheets/connect", cookie });

    const location = new URL(response.headers.get("location") ?? "");
    expect(location.hostname).toBe("accounts.google.com");
    const scope = location.searchParams.get("scope") ?? "";
    expect(scope).toContain("auth/drive.file");
    expect(scope).not.toContain("auth/spreadsheets");
  });

  // covers: AC-907-2
  it("la callback con drive.file concesso salva la credenziale e lo snapshot non chiede di ricollegare", async () => {
    const { user, cookie } = await createUserWithSession();

    const response = await callRoute(sheetsCallback, {
      url: "/api/integrations/google-sheets/callback?code=codice&state=stato-valido",
      cookie: `${cookie}; kwb_google_sheets_oauth_state=stato-valido`,
    });

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("google_sheets")).toBe("connected");
    const credentials = await prisma.googleSheetsCredential.findMany({ where: { user_id: user.id } });
    expect(credentials).toHaveLength(1);
    expect(credentials[0].scope).toContain("drive.file");
    expect((await snapshotOf(cookie)).needsReconnect).toBe(false);
  });

  // covers: AC-907-3
  it("una credenziale con il vecchio scope spreadsheets resta collegata ma va ricollegata", async () => {
    const { user, cookie } = await createUserWithSession();
    await upsertGoogleSheetsCredential({
      userId: user.id,
      refreshToken: randomBytes(8).toString("hex"),
      scope: `${SPREADSHEETS_SCOPE} openid email`,
    });

    const snapshot = await snapshotOf(cookie);

    expect(snapshot.needsReconnect).toBe(true);
    expect(snapshot.status).toBe("connected");
  });

  // covers: AC-907-4
  it("l'export tocca solo la creazione e il file appena creato", async () => {
    const { user, cookie } = await createUserWithSession();
    await upsertGoogleSheetsCredential({
      userId: user.id,
      refreshToken: randomBytes(8).toString("hex"),
      scope: `openid email ${DRIVE_FILE_SCOPE}`,
    });
    const project = await prisma.project.create({ data: { name: "Sheets", workspace_id: await personalWorkspaceId(user.id) } });
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

    const response = await callRoute(exportToSheets, {
      method: "POST",
      url: `/api/projects/${project.id}/export/google-sheets`,
      cookie,
      params: { id: project.id },
      body: { fileName: "Export", scope: "non-excluded" },
    });

    expect(response.status).toBe(200);
    const apiCalls = googleCalls.filter(
      (call) => call.url.startsWith("https://sheets.googleapis.com/") || call.url.startsWith("https://www.googleapis.com/drive")
    );
    expect(apiCalls.length).toBeGreaterThan(1);
    for (const call of apiCalls) {
      const isCreation = call.method === "POST" && call.url === "https://sheets.googleapis.com/v4/spreadsheets";
      expect(isCreation || call.url.includes(`/${SPREADSHEET_ID}/`) || call.url.includes(`/${SPREADSHEET_ID}:`)).toBe(true);
    }
  });
});
