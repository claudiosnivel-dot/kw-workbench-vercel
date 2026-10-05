import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Prisma } from "@/lib/generated/prisma/client";
import { buildResultsClauses, type ResultsFilters } from "@/lib/modules/results-filters";
import { RESULTS_ORDER_BY } from "@/lib/modules/results-order";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

export type ExportFormat = "csv" | "xlsx" | "json";
export type ExportScope = "approved" | "selected" | "review" | "non-excluded" | "filtered";

/** Campi della candidata letti dall'export, nell'ordine delle colonne che seguono subproject_name. */
const EXPORT_FIELD_SELECT = {
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
} as const satisfies Prisma.KeywordCandidateSelect;

/** Riga letta dall'export: i campi, l'id per il cursore e il nome della sezione. */
export const EXPORT_ROW_SELECT = {
  id: true,
  ...EXPORT_FIELD_SELECT,
  subproject: { select: { name: true } },
} satisfies Prisma.KeywordCandidateSelect;

type ExportSourceRow = Prisma.KeywordCandidateGetPayload<{ select: typeof EXPORT_ROW_SELECT }>;

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
const EXPORT_COLUMN_SET: Record<keyof ExportRow, true> = { subproject_name: true, ...EXPORT_FIELD_SELECT };
export const EXPORT_COLUMNS = Object.keys(EXPORT_COLUMN_SET) as (keyof ExportRow)[];

function toExportRow(row: ExportSourceRow): ExportRow {
  return {
    subproject_name: row.subproject.name,
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
  };
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
 * Regola di revisione di ogni scope (T-807, D-23). Rifiutate escluse da tutti gli scope tranne filtered,
 * che applica solo i filtri della vista.
 */
const SCOPE_CLAUSES: Record<ExportScope, Prisma.KeywordCandidateWhereInput[]> = {
  approved: [{ review_status: "approved" }, { brand_status: { not: "excluded" } }],
  selected: [{ selected_for_export: true }, { review_status: { not: "rejected" } }],
  review: [{ review_status: "pending" }],
  "non-excluded": [{ brand_status: { not: "excluded" } }, { review_status: { not: "rejected" } }],
  filtered: [],
};

/**
 * Unica fonte del where di export (file e Google Sheets): la regola dello scope in AND con la vista
 * corrente, cioè progetto verificato, sezione già verificata dalla route e filtri da parseResultsFilters.
 */
export function buildExportWhere(
  projectId: string,
  scope: ExportScope,
  filters: ResultsFilters,
  subprojectId?: string | null
): Prisma.KeywordCandidateWhereInput {
  return { AND: [...buildResultsClauses(projectId, filters, subprojectId), ...SCOPE_CLAUSES[scope]] };
}

/** Righe lette da ogni findMany dell'export (T-805): in memoria resta un blocco, non l'intero set. */
const EXPORT_BATCH_SIZE = 1000;

/**
 * Righe di export lette a blocchi con paginazione a cursore (cursor su id, skip 1) nell'ordine
 * RESULTS_ORDER_BY, che termina con id: nessuna riga saltata o ripetuta tra un blocco e l'altro.
 */
export async function* iterateExportRows(
  where: Prisma.KeywordCandidateWhereInput,
  batchSize = EXPORT_BATCH_SIZE
): AsyncGenerator<ExportRow> {
  let cursor: string | null = null;
  while (true) {
    const batch: ExportSourceRow[] = await prisma.keywordCandidate.findMany({
      where,
      orderBy: RESULTS_ORDER_BY,
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: EXPORT_ROW_SELECT,
    });

    for (const row of batch) {
      yield toExportRow(row);
    }

    if (batch.length < batchSize) {
      return;
    }
    cursor = batch[batch.length - 1].id;
  }
}

type ExportParams = {
  projectId: string;
  subprojectId?: string | null;
  format: ExportFormat;
  scope: ExportScope;
  filters: ResultsFilters;
  csvDialect?: CsvDialect;
};

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Content-Type e nome del file, noti prima di aprire lo stream. */
export function exportFileInfo(params: Pick<ExportParams, "projectId" | "subprojectId" | "format" | "scope">) {
  const date = new Date().toISOString().slice(0, 10);
  const filenameScope = params.subprojectId ? `subproject-${params.subprojectId}` : "project";
  return {
    contentType: CONTENT_TYPES[params.format],
    filename: `seo-god-mode-${params.projectId}-${filenameScope}-${params.scope}-${date}.${params.format}`,
  };
}

// Testo accumulato prima di consegnare un pezzo allo stream.
const CHUNK_TARGET_LENGTH = 64 * 1024;

async function* csvChunks(rows: AsyncIterable<ExportRow>, dialect: CsvDialect): AsyncGenerator<string> {
  let chunk = csvHead(dialect);
  for await (const row of rows) {
    chunk += csvLine(row, dialect);
    if (chunk.length >= CHUNK_TARGET_LENGTH) {
      yield chunk;
      chunk = "";
    }
  }
  if (chunk) {
    yield chunk;
  }
}

/** Array JSON scritto a pezzi, con lo stesso testo di JSON.stringify(rows, null, 2). */
async function* jsonChunks(rows: AsyncIterable<ExportRow>): AsyncGenerator<string> {
  let chunk = "[";
  let empty = true;
  for await (const row of rows) {
    chunk += `${empty ? "\n" : ",\n"}  ${JSON.stringify(row, null, 2).replace(/\n/g, "\n  ")}`;
    empty = false;
    if (chunk.length >= CHUNK_TARGET_LENGTH) {
      yield chunk;
      chunk = "";
    }
  }
  yield `${chunk}${empty ? "]" : "\n]"}`;
}

/** Stream a richiesta: ogni lettura del client chiede il pezzo successivo (e quindi il blocco successivo). */
function textStream(chunks: AsyncGenerator<string>, onError: (error: unknown) => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(encoder.encode(value));
        }
      } catch (error) {
        onError(error);
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

/**
 * Foglio "keywords" scritto con il WorkbookWriter di exceljs su uno stream di passaggio, con commit di
 * ogni riga. I valori sono numeri, booleani o stringhe (mai formule: un testo che inizia con = resta
 * testo); null resta una cella vuota. Con 0 righe il foglio è vuoto (T-406).
 */
function xlsxStream(rows: AsyncIterable<ExportRow>, onError: (error: unknown) => void): ReadableStream<Uint8Array> {
  const output = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: false, useSharedStrings: false });
  const sheet = workbook.addWorksheet("keywords");

  const write = async () => {
    let empty = true;
    for await (const row of rows) {
      if (empty) {
        sheet.addRow(EXPORT_COLUMNS).commit();
        empty = false;
      }
      sheet.addRow(EXPORT_COLUMNS.map((column) => row[column])).commit();
    }
    sheet.commit();
    await workbook.commit();
  };

  write().catch((error: unknown) => {
    onError(error);
    output.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  return Readable.toWeb(output) as ReadableStream<Uint8Array>;
}

/**
 * Export in streaming (T-805). La route verifica autenticazione, progetto e sezione prima di chiamarla.
 * Un errore a metà (per esempio del DB) chiude lo stream con errore invece di consegnare un file troncato
 * con 200 apparentemente completo; il dettaglio finisce solo nel log.
 */
export function streamExport(params: ExportParams): ReadableStream<Uint8Array> {
  const rows = iterateExportRows(buildExportWhere(params.projectId, params.scope, params.filters, params.subprojectId));
  const onError = (error: unknown) =>
    logger.error("export_stream_failed", {
      projectId: params.projectId,
      subprojectId: params.subprojectId ?? null,
      format: params.format,
      error,
    });

  if (params.format === "xlsx") {
    return xlsxStream(rows, onError);
  }

  const chunks = params.format === "csv" ? csvChunks(rows, params.csvDialect ?? CSV_DIALECT_DEFAULT) : jsonChunks(rows);
  return textStream(chunks, onError);
}
