// Gate di T-406 (AC-406-1…3): export XLSX scritto con exceljs al posto di xlsx.
// Gate di T-2103 (AC-2103-2): XLSX nella lingua dell'utente con i booleani nativi, JSON con chiavi e valori tecnici.
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { prisma } from "@/lib/prisma";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

// Chiavi di ExportRow nell'ordine dell'export (lib/modules/export.ts).
const EXPORT_ROW_KEYS = [
  "subproject_name",
  "keyword",
  "normalized_keyword",
  "canonical_keyword",
  "source",
  "source_query",
  "brand_status",
  "review_status",
  "selected_for_export",
  "keyword_type",
  "search_intent",
  "is_question",
  "is_local_intent",
  "is_tool_intent",
  "is_commercial_intent",
  "metrics_status",
  "metrics_provider",
  "avg_monthly_searches",
  "competition",
  "low_top_of_page_bid_micros",
  "high_top_of_page_bid_micros",
  "score",
  // impacted-by: T-707 (sorgente del punteggio dopo score)
  "score_source",
];

const FORMULA_KEYWORD = "=SUM(A1)";

let cookie: string;
let projectId: string;
let sectionId: string;
let ownerId: string;

function exportAs(format: "csv" | "xlsx" | "json", scope = "filtered") {
  return callRoute(exportProject, { url: `/api/projects/${projectId}/export?format=${format}&scope=${scope}`, cookie, params: { id: projectId } });
}

async function workbookOf(response: Response): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.clone().arrayBuffer());
  return workbook;
}

// impacted-by: T-2103 (il foglio ha il nome di export.sheet nella lingua dell'utente, italiano di default)
async function exportedSheet(): Promise<{ response: Response; sheet: ExcelJS.Worksheet; workbook: ExcelJS.Workbook }> {
  const response = await exportAs("xlsx");
  const workbook = await workbookOf(response);
  return { response, workbook, sheet: workbook.getWorksheet(it_.export.sheet) as ExcelJS.Worksheet };
}

function rowOf(sheet: ExcelJS.Worksheet, keyword: string): ExcelJS.Row {
  const keywordColumn = EXPORT_ROW_KEYS.indexOf("keyword") + 1;
  for (let index = 2; index <= sheet.actualRowCount; index += 1) {
    if (sheet.getRow(index).getCell(keywordColumn).value === keyword) {
      return sheet.getRow(index);
    }
  }
  throw new Error(`riga ${keyword} assente`);
}

function cell(row: ExcelJS.Row, key: string): ExcelJS.Cell {
  return row.getCell(EXPORT_ROW_KEYS.indexOf(key) + 1);
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  const owner = await createUserWithSession({ displayName: "xlsx-owner" });
  const project = await prisma.project.create({ data: { name: "Export XLSX", workspace_id: await personalWorkspaceId(owner.user.id) } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  cookie = owner.cookie;
  projectId = project.id;
  sectionId = section.id;
  ownerId = owner.user.id;

  const base = { project_id: project.id, subproject_id: section.id, source: "seed" };
  await prisma.keywordCandidate.createMany({
    data: [
      {
        ...base,
        keyword: "come fare il caffè",
        normalized_keyword: "come fare il caffè",
        canonical_keyword: "come fare il caffè",
        source_query: "caffè",
        avg_monthly_searches: 1200,
        is_question: true,
        low_top_of_page_bid_micros: 1_500_000n,
        score: 90,
      },
      {
        ...base,
        keyword: FORMULA_KEYWORD,
        normalized_keyword: FORMULA_KEYWORD,
        canonical_keyword: FORMULA_KEYWORD,
        source_query: "sum",
        score: 80,
      },
      {
        ...base,
        keyword: "moka tre tazze",
        normalized_keyword: "moka tre tazze",
        canonical_keyword: "moka tre tazze",
        source_query: "moka",
        score: 70,
      },
    ],
  });
});

describe("export XLSX con exceljs", () => {
  // covers: AC-406-1
  // Aggiornato da T-2103 (impacted-by): foglio e intestazioni sono le traduzioni italiane dei cataloghi.
  it("risponde 200 con il content type XLSX e il foglio delle keyword ha intestazione e 3 righe", async () => {
    const { response, workbook, sheet } = await exportedSheet();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([it_.export.sheet]);
    expect(sheet.actualRowCount).toBe(4);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(
      EXPORT_ROW_KEYS.map((key) => it_.export.columns[key as keyof typeof it_.export.columns])
    );
  });

  // covers: AC-406-2
  it("volume numerico, is_question booleano e micros come stringa", async () => {
    const { sheet } = await exportedSheet();
    const row = rowOf(sheet, "come fare il caffè");

    expect(cell(row, "avg_monthly_searches").value).toBe(1200);
    expect(cell(row, "avg_monthly_searches").type).toBe(ExcelJS.ValueType.Number);
    expect(cell(row, "is_question").value).toBe(true);
    expect(cell(row, "is_question").type).toBe(ExcelJS.ValueType.Boolean);
    expect(cell(row, "low_top_of_page_bid_micros").value).toBe("1500000");
    expect(cell(row, "low_top_of_page_bid_micros").type).toBe(ExcelJS.ValueType.String);
  });

  // covers: AC-406-3
  it("una keyword che inizia con = resta testo, senza formula", async () => {
    const { sheet } = await exportedSheet();
    const keywordCell = cell(rowOf(sheet, FORMULA_KEYWORD), "keyword");

    expect(keywordCell.formula).toBeUndefined();
    expect(keywordCell.type).toBe(ExcelJS.ValueType.String);
    expect(keywordCell.value).toBe(FORMULA_KEYWORD);
  });
});

describe("export XLSX e JSON nella lingua dell'utente (T-2103)", () => {
  // covers: AC-2103-2
  it("in inglese l'XLSX ha il foglio inglese, l'intestazione del CSV e is_question booleano; il JSON resta tecnico", async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { ui_locale: "en" } });
    const keyword = "migliore moka da comprare";
    await prisma.keywordCandidate.create({
      data: {
        project_id: projectId,
        subproject_id: sectionId,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: "moka",
        review_status: "approved",
        search_intent: "commercial",
        is_question: true,
        score: 60,
      },
    });

    const csv = await (await exportAs("csv", "approved")).text();
    const workbook = await workbookOf(await exportAs("xlsx", "approved"));
    const json = (await (await exportAs("json", "approved")).json()) as Record<string, unknown>[];

    const sheet = workbook.worksheets[0];
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([en.export.sheet]);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(csv.replace(/^\uFEFF/, "").split("\r\n")[0].split(";"));
    expect(cell(sheet.getRow(2), "is_question").value).toBe(true);
    expect(cell(sheet.getRow(2), "is_question").type).toBe(ExcelJS.ValueType.Boolean);
    expect(json).toHaveLength(1);
    expect(Object.keys(json[0])).toEqual(EXPORT_ROW_KEYS);
    expect(json[0]).toEqual({
      subproject_name: "Generale",
      keyword: "migliore moka da comprare",
      normalized_keyword: "migliore moka da comprare",
      canonical_keyword: "migliore moka da comprare",
      source: "seed",
      source_query: "moka",
      brand_status: "allowed",
      review_status: "approved",
      selected_for_export: false,
      keyword_type: "generic",
      search_intent: "commercial",
      is_question: true,
      is_local_intent: false,
      is_tool_intent: false,
      is_commercial_intent: false,
      metrics_status: "missing",
      metrics_provider: "NONE",
      avg_monthly_searches: null,
      competition: null,
      low_top_of_page_bid_micros: null,
      high_top_of_page_bid_micros: null,
      score: 60,
      score_source: "heuristic",
    });
  });
});
