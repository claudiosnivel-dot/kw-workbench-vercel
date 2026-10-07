// Gate di T-406 (AC-406-1…3): export XLSX scritto con exceljs al posto di xlsx.
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { prisma } from "@/lib/prisma";
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

async function exportedSheet(): Promise<{ response: Response; sheet: ExcelJS.Worksheet; workbook: ExcelJS.Workbook }> {
  const response = await callRoute(exportProject, {
    url: `/api/projects/${projectId}/export?format=xlsx&scope=filtered`,
    cookie,
    params: { id: projectId },
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.clone().arrayBuffer());
  return { response, workbook, sheet: workbook.getWorksheet("keywords") as ExcelJS.Worksheet };
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
  it("risponde 200 con il content type XLSX e il foglio keywords ha intestazione e 3 righe", async () => {
    const { response, workbook, sheet } = await exportedSheet();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["keywords"]);
    expect(sheet.actualRowCount).toBe(4);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(EXPORT_ROW_KEYS);
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
