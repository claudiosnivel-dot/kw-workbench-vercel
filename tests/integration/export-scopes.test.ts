// Gate di T-2402 (AC-2402-1…3): ambiti di export tenute, tutte e filtrate, uguali per file e Google Sheets (API Google
// simulate); niente colonna della selezione e revisione mostrata come Tenuta o Scartata nella lingua dell'utente.
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exportToSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { GET as exportFile } from "@/app/api/projects/[id]/export/route";
import type { Prisma } from "@/lib/generated/prisma/client";
import { EXPORT_COLUMNS } from "@/lib/modules/export";
import { prisma } from "@/lib/prisma";
import en from "@/messages/en.json";
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

type KeywordData = Partial<Prisma.KeywordCandidateCreateManyInput> & { keyword: string };

const KEYWORD_COLUMN = EXPORT_COLUMNS.indexOf("keyword");

let cookie: string;
let userId: string;
let projectId: string;
let sectionA: string;

async function insertKeywords(sectionId: string, rows: KeywordData[]) {
  await prisma.keywordCandidate.createMany({
    data: rows.map((row) => ({
      project_id: projectId,
      subproject_id: sectionId,
      normalized_keyword: row.keyword,
      canonical_keyword: row.keyword,
      source: "seed",
      source_query: row.keyword,
      ...row,
    })),
  });
}

function download(query: string) {
  return callRoute(exportFile, { url: `/api/projects/${projectId}/export?${query}`, cookie, params: { id: projectId } });
}

/** Righe di dati di un CSV (senza BOM e intestazione), ciascuna come elenco di celle. */
async function csvRows(response: Response): Promise<string[][]> {
  const lines = (await response.text()).replace(/^﻿/, "").replace(/\r\n$/, "").split("\r\n");
  return lines.slice(1).map((line) => line.slice(1, -1).split('";"'));
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  const owner = await createUserWithSession({ displayName: "t2402-owner" });
  cookie = owner.cookie;
  userId = owner.user.id;
  const project = await prisma.project.create({
    data: { name: "Scope", workspace_id: owner.workspaceId, language_code: "it", country_code: "IT" },
  });
  projectId = project.id;
  sectionA = (await prisma.subproject.create({ data: { project_id: project.id, name: "A", position: 0 } })).id;
  const sectionB = (await prisma.subproject.create({ data: { project_id: project.id, name: "B", position: 1 } })).id;
  await insertKeywords(sectionA, [
    { keyword: "come scegliere le scarpe", is_question: true, score: 50 },
    { keyword: "quali scarpe comprare", is_question: true, score: 40 },
    { keyword: "scarpe running", score: 30 },
    { keyword: "scarpe trail", score: 20 },
    { keyword: "scarpe usate", review_status: "rejected", score: 10 },
  ]);
  await insertKeywords(sectionB, [{ keyword: "calzini" }, { keyword: "calzini tecnici" }, { keyword: "calzini corsa" }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ambiti di export", () => {
  // covers: AC-2402-1
  it("kept dell'argomento, kept del progetto, all dell'argomento e filtered con le domande", async () => {
    const counts = [];
    for (const query of [
      `format=csv&scope=kept&subprojectId=${sectionA}`,
      "format=csv&scope=kept",
      `format=csv&scope=all&subprojectId=${sectionA}`,
      `format=csv&scope=filtered&subprojectId=${sectionA}&chip=questions`,
    ]) {
      const response = await download(query);
      expect(response.status, query).toBe(200);
      counts.push((await csvRows(response)).length);
    }

    expect(counts).toEqual([4, 7, 5, 2]);
  });

  // covers: AC-2402-2
  it("su Google Sheets kept scrive le stesse righe del CSV; uno scope precedente riceve 400 VALIDATION_ERROR", async () => {
    const writes: unknown[][][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: randomUUID() });
        if (url === "https://sheets.googleapis.com/v4/spreadsheets") return json({ spreadsheetId: "foglio" });
        if (url.endsWith("/values:batchUpdate")) {
          writes.push((JSON.parse(String(init?.body)) as { data: { values: unknown[][] }[] }).data[0].values);
        }
        return json({});
      })
    );

    const csv = await csvRows(await download(`format=csv&scope=kept&subprojectId=${sectionA}`));
    const sheets = await callRoute(exportToSheets, {
      method: "POST",
      url: `/api/projects/${projectId}/export/google-sheets`,
      cookie,
      params: { id: projectId },
      body: { fileName: "Scope", scope: "kept", subprojectId: sectionA, filters: {} },
    });
    const selected = await download(`format=csv&scope=selected&subprojectId=${sectionA}`);

    expect(sheets.status).toBe(200);
    const written = writes.flatMap((values) => values).slice(1);
    expect(written.map((row) => row[KEYWORD_COLUMN])).toEqual(csv.map((row) => row[KEYWORD_COLUMN]));
    expect(written).toHaveLength(4);
    expect(selected.status).toBe(400);
    expect(((await selected.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  // covers: AC-2402-3
  it("in inglese l'XLSX all non ha la colonna della selezione e la scartata è Discarded", async () => {
    await prisma.user.update({ where: { id: userId }, data: { ui_locale: "en" } });

    const response = await download(`format=xlsx&scope=all&subprojectId=${sectionA}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.worksheets[0];
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    const reviewColumn = EXPORT_COLUMNS.indexOf("review_status") + 1;
    const discardedRow = sheet.getRows(2, sheet.actualRowCount - 1)?.find((row) => row.getCell(KEYWORD_COLUMN + 1).value === "scarpe usate");

    expect(response.status).toBe(200);
    expect(header).toEqual(EXPORT_COLUMNS.map((column) => en.export.columns[column]));
    expect(EXPORT_COLUMNS).not.toContain("selected_for_export");
    expect(header).toHaveLength(22);
    expect(discardedRow?.getCell(reviewColumn).value).toBe(en.export.values.review.discarded);
  });
});
