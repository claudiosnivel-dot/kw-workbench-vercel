import ExcelJS from "exceljs";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildResultsWhere, ResultsFilters } from "@/lib/modules/results-filters";
import { RESULTS_ORDER_BY } from "@/lib/modules/results-order";

export type ExportFormat = "csv" | "xlsx" | "json";
export type ExportScope = "approved" | "selected" | "review" | "non-excluded" | "filtered";

type ExportSourceRow = {
  keyword: string;
  normalized_keyword: string;
  canonical_keyword: string;
  source: string;
  source_query: string;
  brand_status: string;
  review_status: string;
  selected_for_export: boolean;
  keyword_type: string;
  search_intent: string;
  is_question: boolean;
  is_local_intent: boolean;
  is_tool_intent: boolean;
  is_commercial_intent: boolean;
  metrics_status: string;
  metrics_provider: string;
  avg_monthly_searches: number | null;
  competition: number | null;
  low_top_of_page_bid_micros: bigint | null;
  high_top_of_page_bid_micros: bigint | null;
  score: number | null;
  score_source: string;
  subproject_name: string;
};

export type ExportRow = {
  subproject_name: string;
  keyword: string;
  normalized_keyword: string;
  canonical_keyword: string;
  source: string;
  source_query: string;
  brand_status: string;
  review_status: string;
  selected_for_export: boolean;
  keyword_type: string;
  search_intent: string;
  is_question: boolean;
  is_local_intent: boolean;
  is_tool_intent: boolean;
  is_commercial_intent: boolean;
  metrics_status: string;
  metrics_provider: string;
  avg_monthly_searches: number | null;
  competition: number | null;
  low_top_of_page_bid_micros: string | null;
  high_top_of_page_bid_micros: string | null;
  score: number | null;
  score_source: string;
};

/** Colonne dell'export nell'ordine di ExportRow: il Record impone tutte e sole le chiavi del tipo. */
const EXPORT_COLUMN_SET: Record<keyof ExportRow, true> = {
  subproject_name: true,
  keyword: true,
  normalized_keyword: true,
  canonical_keyword: true,
  source: true,
  source_query: true,
  brand_status: true,
  review_status: true,
  selected_for_export: true,
  keyword_type: true,
  search_intent: true,
  is_question: true,
  is_local_intent: true,
  is_tool_intent: true,
  is_commercial_intent: true,
  metrics_status: true,
  metrics_provider: true,
  avg_monthly_searches: true,
  competition: true,
  low_top_of_page_bid_micros: true,
  high_top_of_page_bid_micros: true,
  score: true,
  score_source: true,
};
const EXPORT_COLUMNS = Object.keys(EXPORT_COLUMN_SET) as (keyof ExportRow)[];

function serialize(rows: ExportSourceRow[]): ExportRow[] {
  return rows.map((row) => ({
    subproject_name: row.subproject_name,
    keyword: row.keyword,
    normalized_keyword: row.normalized_keyword,
    canonical_keyword: row.canonical_keyword,
    source: row.source,
    source_query: row.source_query,
    brand_status: row.brand_status,
    review_status: row.review_status,
    selected_for_export: row.selected_for_export,
    keyword_type: row.keyword_type,
    search_intent: row.search_intent,
    is_question: row.is_question,
    is_local_intent: row.is_local_intent,
    is_tool_intent: row.is_tool_intent,
    is_commercial_intent: row.is_commercial_intent,
    metrics_status: row.metrics_status,
    metrics_provider: row.metrics_provider,
    avg_monthly_searches: row.avg_monthly_searches,
    competition: row.competition,
    low_top_of_page_bid_micros: row.low_top_of_page_bid_micros != null ? row.low_top_of_page_bid_micros.toString() : null,
    high_top_of_page_bid_micros: row.high_top_of_page_bid_micros != null ? row.high_top_of_page_bid_micros.toString() : null,
    score: row.score,
    score_source: row.score_source,
  }));
}

/**
 * Dialetti CSV (T-804, D-23). excel-it (predefinito) si apre in Excel italiano: BOM UTF-8, separatore
 * ';' e decimali con la virgola. rfc4180: nessun BOM, ',' e decimali con il punto. Entrambi chiudono
 * ogni riga con CRLF e mettono ogni valore tra doppi apici, raddoppiando gli apici interni.
 */
export type CsvDialect = "excel-it" | "rfc4180";

const CSV_DIALECTS: Record<CsvDialect, { bom: boolean; separator: string; decimal: string }> = {
  "excel-it": { bom: true, separator: ";", decimal: "," },
  rfc4180: { bom: false, separator: ",", decimal: "." },
};

export const CSV_DIALECT_DEFAULT: CsvDialect = "excel-it";

export function isCsvDialect(value: string): value is CsvDialect {
  return Object.hasOwn(CSV_DIALECTS, value);
}

const UTF8_BOM = "﻿";
const CSV_EOL = "\r\n";

// CWE-1236: un testo che inizia con uno di questi caratteri diventerebbe una formula nel foglio di calcolo.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function csvCell(value: unknown, dialect: CsvDialect): string {
  let text: string;
  if (value == null) {
    text = "";
  } else if (typeof value === "number") {
    text = String(value).replace(".", CSV_DIALECTS[dialect].decimal);
  } else if (typeof value === "boolean") {
    text = String(value);
  } else {
    text = String(value);
    if (FORMULA_TRIGGER.test(text)) {
      text = `'${text}`;
    }
  }

  return `"${text.replace(/"/g, '""')}"`;
}

/** Inizio del file: BOM (solo excel-it) e riga di intestazione con le colonne di ExportRow. */
function csvHead(dialect: CsvDialect): string {
  const { bom, separator } = CSV_DIALECTS[dialect];
  return `${bom ? UTF8_BOM : ""}${EXPORT_COLUMNS.join(separator)}${CSV_EOL}`;
}

function csvLine(row: ExportRow, dialect: CsvDialect): string {
  const { separator } = CSV_DIALECTS[dialect];
  return `${EXPORT_COLUMNS.map((column) => csvCell(row[column], dialect)).join(separator)}${CSV_EOL}`;
}

export function serializeCsv(rows: ExportRow[], options: { dialect: CsvDialect }): Buffer<ArrayBuffer> {
  const text = csvHead(options.dialect) + rows.map((row) => csvLine(row, options.dialect)).join("");
  return Buffer.from(text, "utf8");
}

/**
 * Foglio "keywords" con exceljs: intestazione dalle chiavi di ExportRow e una riga per record. I valori
 * sono scritti come numeri, booleani o stringhe (mai come formula: un testo che inizia con = resta
 * testo); null resta una cella vuota. Con 0 righe il foglio è vuoto, come con il vecchio xlsx.
 */
async function rowsToXlsx(rows: ExportRow[]): Promise<Buffer<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("keywords");

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]) as (keyof ExportRow)[];
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(headers.map((header) => row[header]));
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function buildScopeWhere(
  projectId: string,
  scope: ExportScope,
  filters: ResultsFilters,
  subprojectId?: string | null
): Prisma.KeywordCandidateWhereInput {
  if (scope === "filtered") {
    return buildResultsWhere(projectId, filters, subprojectId);
  }

  const andFilters: Prisma.KeywordCandidateWhereInput[] = [{ project_id: projectId }];

  if (subprojectId) {
    andFilters.push({ subproject_id: subprojectId });
  }

  if (scope === "approved") {
    andFilters.push({ review_status: "approved" });
  }

  if (scope === "selected") {
    andFilters.push({ selected_for_export: true });
  }

  if (scope === "review") {
    andFilters.push({ review_status: "pending" });
  }

  if (scope === "non-excluded" || scope === "approved") {
    andFilters.push({ brand_status: { not: "excluded" } });
  }

  return { AND: andFilters };
}

export async function getExportRows(params: {
  projectId: string;
  subprojectId?: string | null;
  scope: ExportScope;
  filters: ResultsFilters;
}): Promise<ExportRow[]> {
  const where = buildScopeWhere(params.projectId, params.scope, params.filters, params.subprojectId);

  const rows = await prisma.keywordCandidate.findMany({
    where,
    orderBy: RESULTS_ORDER_BY,
    select: {
      keyword: true,
      normalized_keyword: true,
      canonical_keyword: true,
      source: true,
      source_query: true,
      brand_status: true,
      review_status: true,
      selected_for_export: true,
      keyword_type: true,
      search_intent: true,
      is_question: true,
      is_local_intent: true,
      is_tool_intent: true,
      is_commercial_intent: true,
      metrics_status: true,
      metrics_provider: true,
      avg_monthly_searches: true,
      competition: true,
      low_top_of_page_bid_micros: true,
      high_top_of_page_bid_micros: true,
      score: true,
      score_source: true,
      subproject: {
        select: {
          name: true,
        },
      },
    },
  });

  return serialize(
    rows.map((row) => ({
      ...row,
      subproject_name: row.subproject.name,
    }))
  );
}

export async function generateExport(params: {
  projectId: string;
  subprojectId?: string | null;
  format: ExportFormat;
  scope: ExportScope;
  filters: ResultsFilters;
  csvDialect?: CsvDialect;
}) {
  const payload = await getExportRows({
    projectId: params.projectId,
    subprojectId: params.subprojectId,
    scope: params.scope,
    filters: params.filters,
  });

  const date = new Date().toISOString().slice(0, 10);
  const filenameScope = params.subprojectId ? `subproject-${params.subprojectId}` : "project";
  const filenameBase = `seo-god-mode-${params.projectId}-${filenameScope}-${params.scope}-${date}`;

  if (params.format === "json") {
    return {
      contentType: "application/json",
      filename: `${filenameBase}.json`,
      buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
    };
  }

  if (params.format === "csv") {
    return {
      contentType: "text/csv; charset=utf-8",
      filename: `${filenameBase}.csv`,
      buffer: serializeCsv(payload, { dialect: params.csvDialect ?? CSV_DIALECT_DEFAULT }),
    };
  }

  return {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `${filenameBase}.xlsx`,
    buffer: await rowsToXlsx(payload),
  };
}