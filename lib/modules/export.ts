import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildResultsWhere, ResultsFilters } from "@/lib/modules/results-filters";

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
};

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
  }));
}

function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((header) => {
      const value = (row as Record<string, unknown>)[header];
      const escaped = String(value ?? "").replace(/"/g, '""');
      return `"${escaped}"`;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
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
    orderBy: [{ score: "desc" }, { keyword: "asc" }],
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
      buffer: Buffer.from(rowsToCsv(payload), "utf8"),
    };
  }

  const worksheet = XLSX.utils.json_to_sheet(payload);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "keywords");
  const binary = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `${filenameBase}.xlsx`,
    buffer: Buffer.from(binary),
  };
}