// Gate di T-806 (AC-806-1…4): l'export Google Sheets scrive a blocchi di 5.000 righe, non lascia file
// incompleti sul Drive dell'utente, ordina e deduplica i fogli come Google si aspetta e non restituisce
// al client il messaggio di eccezioni interne. Le API Google sono simulate con un fetch mockato.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exportToSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { exportProjectToGoogleSheets } from "@/lib/modules/google-sheets-export";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/integrations/google-sheets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/google-sheets")>()),
  getDecryptedGoogleSheetsRefreshToken: vi.fn(async () => randomUUID()),
}));

vi.mock("@/lib/integrations/google-sheets-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integrations/google-sheets-config")>()),
  getGoogleSheetsApiConfig: vi.fn(async () => ({
    clientId: "client-di-prova",
    clientSecret: randomUUID(),
    redirectUri: "http://localhost:3000/api/integrations/google-sheets/callback",
  })),
}));

vi.mock("@/lib/modules/google-sheets-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/google-sheets-export")>();
  return { ...actual, exportProjectToGoogleSheets: vi.fn(actual.exportProjectToGoogleSheets) };
});

const SPREADSHEET_ID = "foglio-di-prova";
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const TIMEOUT_MS = 60_000;

type GoogleCall = { method: string; url: string; body: unknown; hasSignal: boolean };

/** Fetch simulato delle API Google: registra ogni chiamata e risponde secondo lo scenario. */
function mockGoogle(options: { failWriteNumber?: number; driveDeleteStatus?: number } = {}): GoogleCall[] {
  const calls: GoogleCall[] = [];
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
      calls.push({ method, url, body, hasSignal: init?.signal instanceof AbortSignal });
      const json = (status: number, payload: unknown) =>
        new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return json(200, { access_token: randomUUID(), token_type: "Bearer" });
      }
      if (url === "https://sheets.googleapis.com/v4/spreadsheets" && method === "POST") {
        return json(200, { spreadsheetId: SPREADSHEET_ID, spreadsheetUrl: SPREADSHEET_URL });
      }
      if (url.endsWith(`/${SPREADSHEET_ID}/values:batchUpdate`)) {
        writes += 1;
        return writes === options.failWriteNumber ? json(500, { error: { code: 500 } }) : json(200, {});
      }
      if (url === `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}` && method === "DELETE") {
        const status = options.driveDeleteStatus ?? 204;
        return status === 204 ? new Response(null, { status }) : json(status, { error: { code: status } });
      }
      if (url.endsWith(`/${SPREADSHEET_ID}:batchUpdate`)) {
        return json(200, { spreadsheetId: SPREADSHEET_ID });
      }
      return json(404, { error: "endpoint non simulato" });
    })
  );
  return calls;
}

function valueWrites(calls: GoogleCall[]): { range: string; values: unknown[][] }[] {
  return calls
    .filter((call) => call.url.endsWith("/values:batchUpdate"))
    .map((call) => (call.body as { data: { range: string; values: unknown[][] }[] }).data[0]);
}

async function createOwnerProject() {
  const owner = await createUserWithSession({ displayName: `t806-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({
    data: { name: "Sheets", owner_user_id: owner.user.id, language_code: "it", country_code: "IT" },
  });
  return { cookie: owner.cookie, projectId: project.id };
}

async function createSectionWithRows(projectId: string, name: string, position: number, rows: number) {
  const section = await prisma.subproject.create({ data: { project_id: projectId, name, position } });
  for (let start = 0; start < rows; start += 5000) {
    await prisma.keywordCandidate.createMany({
      data: Array.from({ length: Math.min(5000, rows - start) }, (_, offset) => {
        const keyword = `${name.toLowerCase()} keyword ${String(start + offset).padStart(5, "0")}`;
        return {
          project_id: projectId,
          subproject_id: section.id,
          keyword,
          normalized_keyword: keyword,
          canonical_keyword: keyword,
          source: "seed",
          source_query: keyword,
          score: 10,
        };
      }),
    });
  }
  return section.id;
}

function exportRequest(cookie: string, projectId: string, subprojectId: string | null) {
  return callRoute(exportToSheets, {
    method: "POST",
    url: `/api/projects/${projectId}/export/google-sheets`,
    cookie,
    params: { id: projectId },
    body: { fileName: "Export di prova", scope: "filtered", subprojectId, filters: {} },
  });
}

function captureStdout(): string[] {
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
  return written;
}

function errorLines(written: string[]): string[] {
  return written
    .join("")
    .split("\n")
    .filter((line) => line.startsWith("{") && (JSON.parse(line) as { level?: string }).level === "error");
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("export Google Sheets a blocchi", () => {
  // covers: AC-806-1
  it(
    "12.000 righe in 3 scritture da 5.000, 5.000 e 2.000, intestazione solo nella prima",
    async () => {
      const { cookie, projectId } = await createOwnerProject();
      const sectionId = await createSectionWithRows(projectId, "Generale", 0, 12_000);
      const calls = mockGoogle();

      const response = await exportRequest(cookie, projectId, sectionId);
      const body = (await response.json()) as { data: { exportedRows: number } };
      const writes = valueWrites(calls);

      expect(response.status).toBe(200);
      expect(body.data.exportedRows).toBe(12_000);
      expect(writes.map((write) => write.values.length)).toEqual([5001, 5000, 2000]);
      expect(writes[0].values[0]).toContain("keyword");
      expect(writes[1].values[0]).not.toContain("keyword");
      expect(calls.every((call) => call.hasSignal)).toBe(true);
    },
    TIMEOUT_MS
  );
});

describe("pulizia del file incompleto", () => {
  // covers: AC-806-2
  it(
    "scrittura fallita: DELETE su Drive e 502 senza URL; con DELETE 403 rinomina in [INCOMPLETO] e restituisce l'URL",
    async () => {
      const { cookie, projectId } = await createOwnerProject();
      const sectionId = await createSectionWithRows(projectId, "Generale", 0, 12_000);

      const deletedCalls = mockGoogle({ failWriteNumber: 2, driveDeleteStatus: 204 });
      const deleted = await exportRequest(cookie, projectId, sectionId);
      const deletedText = await deleted.text();
      vi.unstubAllGlobals();

      const renamedCalls = mockGoogle({ failWriteNumber: 2, driveDeleteStatus: 403 });
      const renamed = await exportRequest(cookie, projectId, sectionId);
      const renamedText = await renamed.text();

      const deletes = deletedCalls.filter((call) => call.method === "DELETE");
      const renames = renamedCalls
        .filter((call) => call.url.endsWith(`/${SPREADSHEET_ID}:batchUpdate`))
        .map(
          (call) =>
            (call.body as { requests: { updateSpreadsheetProperties: { properties: { title: string } } }[] }).requests[0]
              .updateSpreadsheetProperties.properties.title
        );

      expect(deletes).toHaveLength(1);
      expect(deletes[0].url).toBe(`https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}`);
      expect(deleted.status).toBe(502);
      expect(deletedText).not.toContain(SPREADSHEET_URL);
      expect(renames).toHaveLength(1);
      expect(renames[0].startsWith("[INCOMPLETO] ")).toBe(true);
      expect(renamed.status).toBe(502);
      expect(renamedText).toContain(SPREADSHEET_URL);
    },
    TIMEOUT_MS
  );
});

describe("fogli per sezione", () => {
  // covers: AC-806-3
  it("ordina i fogli per posizione della sezione e deduplica i titoli senza distinguere le maiuscole", async () => {
    const { cookie, projectId } = await createOwnerProject();
    await createSectionWithRows(projectId, "Zeta", 0, 3);
    await createSectionWithRows(projectId, "Generale", 1, 3);
    await createSectionWithRows(projectId, "generale", 2, 3);
    const calls = mockGoogle();

    const response = await exportRequest(cookie, projectId, null);
    const create = calls.find((call) => call.url === "https://sheets.googleapis.com/v4/spreadsheets");
    const titles = (create?.body as { sheets: { properties: { title: string } }[] }).sheets.map(
      (sheet) => sheet.properties.title
    );

    expect(response.status).toBe(200);
    expect(titles).toEqual(["Zeta", "Generale", "generale (2)"]);
  });
});

describe("errori interni", () => {
  // covers: AC-806-4
  it("un'eccezione non prevista diventa un 500 generico, senza il messaggio interno, con una riga di log", async () => {
    const { cookie, projectId } = await createOwnerProject();
    vi.mocked(exportProjectToGoogleSheets).mockRejectedValueOnce(new TypeError("cannot read secret_field"));
    const written = captureStdout();

    const response = await exportRequest(cookie, projectId, null);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect((JSON.parse(text) as { error: string }).error).toBe("Errore interno durante l'export su Google Sheets");
    expect(text).not.toContain("secret_field");
    // Il log degli errori è il logger JSON di T-602 su stdout (come per AC-706-3), non console.error.
    expect(errorLines(written)).toHaveLength(1);
  });
});
