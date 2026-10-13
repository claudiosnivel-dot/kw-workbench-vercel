import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  BrandStatus,
  KeywordType,
  MetricsProvider,
  MetricsStatus,
  ReviewStatus,
  ScoreSource,
  SearchIntent,
} from "@/lib/generated/prisma/enums";
import { textStream } from "@/lib/http/text-stream";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import type { ExportFormat, ExportScope } from "@/lib/modules/export-types";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { buildResultsClauses, type ResultsFilters } from "@/lib/modules/results-filters";
import { RESULTS_ORDER_BY } from "@/lib/modules/results-order";
import { catalogTranslator } from "@/lib/modules/strategy/translator";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";


/**
 * Campi della candidata letti dall'export, nell'ordine delle colonne che seguono subproject_name; li riusa l'export
 * dell'account (T-1804).
 */
export const EXPORT_FIELD_SELECT = {
  keyword: true,
  normalized_keyword: true,
  canonical_keyword: true,
  source: true,
  source_query: true,
  brand_status: true,
  review_status: true,
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

/**
 * Valori codificati con un'etichetta nei cataloghi (T-2103): gruppo del catalogo, valori noti ed eventuale chiave del
 * catalogo diversa dal valore. Le etichette sono quelle della pagina dei risultati dove esistono; le sorgenti sono
 * quelle scritte dalla pipeline; la revisione mostra solo Tenuta o Scartata (T-2402, regola di T-2401).
 */
const VALUE_LABELS: Partial<
  Record<keyof ExportRow, { group: string; values: readonly string[]; key?: (value: string) => string }>
> = {
  source: { group: "export.values.source", values: ["seed", "google-direct", "mock-autocomplete"] },
  brand_status: { group: "results.brand", values: Object.values(BrandStatus) },
  review_status: {
    group: "export.values.review",
    values: Object.values(ReviewStatus),
    key: (value) => (value === ReviewStatus.rejected ? "discarded" : "kept"),
  },
  keyword_type: { group: "results.type", values: Object.values(KeywordType) },
  search_intent: { group: "results.intent", values: Object.values(SearchIntent) },
  metrics_status: { group: "export.values.metricsStatus", values: Object.values(MetricsStatus) },
  metrics_provider: { group: "export.values.metricsProvider", values: Object.values(MetricsProvider) },
  score_source: { group: "export.values.scoreSource", values: Object.values(ScoreSource) },
};

type ExportCell = string | number | boolean | null;

/**
 * Testi di CSV, XLSX e Google Sheets in una lingua (T-2103): nome del foglio XLSX, intestazioni nell'ordine di
 * EXPORT_COLUMNS e celle della riga con i valori codificati tradotti (un valore senza etichetta, come una sorgente
 * sconosciuta, resta com'è). I booleani restano booleani, nativi in XLSX e Google Sheets; il CSV li scrive con yes e no.
 * L'export JSON non li usa: chiavi e valori restano tecnici.
 */
export type ExportLabels = {
  sheet: string;
  columns: string[];
  yes: string;
  no: string;
  cells: (row: ExportRow) => ExportCell[];
};

export function exportLabels(locale: string): ExportLabels {
  const t = catalogTranslator(locale);
  const labels = new Map(
    Object.entries(VALUE_LABELS).map(([column, { group, values, key }]) => [
      column,
      new Map(values.map((value) => [value, t(`${group}.${key ? key(value) : value}`)])),
    ])
  );
  return {
    sheet: t("export.sheet"),
    columns: EXPORT_COLUMNS.map((column) => t(`export.columns.${column}`)),
    yes: t("export.values.yes"),
    no: t("export.values.no"),
    cells: (row) =>
      EXPORT_COLUMNS.map((column) => {
        const value = row[column];
        return typeof value === "string" ? (labels.get(column)?.get(value) ?? value) : value;
      }),
  };
}

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

function neutralizeFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown, dialect: CsvDialect): string {
  let text: string;
  if (value == null) {
    text = "";
  } else if (typeof value === "number") {
    text = String(value).replace(".", CSV_DIALECTS[dialect].decimal);
  } else if (typeof value === "boolean") {
    text = String(value);
  } else {
    text = neutralizeFormula(String(value));
  }

  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Inizio di un file CSV: BOM (solo excel-it) e riga di intestazione con le colonne date, con la stessa protezione dalle
 * formule delle celle (le intestazioni tradotte, T-2102 e T-2103).
 */
export function csvHeader(columns: readonly string[], dialect: CsvDialect): string {
  const { bom, separator } = CSV_DIALECTS[dialect];
  return `${bom ? UTF8_BOM : ""}${columns.map(neutralizeFormula).join(separator)}${CSV_EOL}`;
}

/** Riga CSV con la protezione dalle formule (CWE-1236): la usano anche gli export delle strategie (T-1906). */
export function csvRecord(values: readonly unknown[], dialect: CsvDialect): string {
  return `${values.map((value) => csvCell(value, dialect)).join(CSV_DIALECTS[dialect].separator)}${CSV_EOL}`;
}

/** Riga CSV dell'export dei risultati: valori tradotti e sì/no nella lingua dell'export (T-2103). */
function csvLine(row: ExportRow, dialect: CsvDialect, labels: ExportLabels): string {
  const cells = labels.cells(row).map((cell) => (typeof cell === "boolean" ? (cell ? labels.yes : labels.no) : cell));
  return csvRecord(cells, dialect);
}

/** CSV dei risultati nella lingua data (T-2103), di default l'italiano. */
export function serializeCsv(rows: ExportRow[], options: { dialect: CsvDialect; locale?: string }): Buffer<ArrayBuffer> {
  const labels = exportLabels(options.locale ?? DEFAULT_LOCALE);
  const text = csvHeader(labels.columns, options.dialect) + rows.map((row) => csvLine(row, options.dialect, labels)).join("");
  return Buffer.from(text, "utf8");
}

/**
 * Unica fonte del where di export, file e Google Sheets (T-2402, D-23 emendata). Il perimetro è il progetto verificato,
 * con la sezione (argomento) già verificata dalla route se c'è: kept = le keyword tenute del perimetro, all = tutte,
 * scartate comprese, entrambe senza i filtri della vista; filtered = esattamente la vista corrente con tutti i suoi
 * filtri da parseResultsFilters (stato tenute o scartate compreso).
 */
export function buildExportWhere(
  projectId: string,
  scope: ExportScope,
  filters: ResultsFilters,
  subprojectId?: string | null
): Prisma.KeywordCandidateWhereInput {
  if (scope === "filtered") {
    return { AND: buildResultsClauses(projectId, filters, subprojectId) };
  }
  const perimeter = buildResultsClauses(projectId, {}, subprojectId);
  return { AND: scope === "kept" ? [...perimeter, KEPT_WHERE] : perimeter };
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
  /** Lingua di intestazioni, valori e foglio di CSV e XLSX (T-2103); il JSON resta tecnico. */
  locale: string;
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
    filename: `titan-seo-${params.projectId}-${filenameScope}-${params.scope}-${date}.${params.format}`,
  };
}

// Testo accumulato prima di consegnare un pezzo allo stream.
const CHUNK_TARGET_LENGTH = 64 * 1024;

async function* csvChunks(rows: AsyncIterable<ExportRow>, dialect: CsvDialect, labels: ExportLabels): AsyncGenerator<string> {
  let chunk = csvHeader(labels.columns, dialect);
  for await (const row of rows) {
    chunk += csvLine(row, dialect, labels);
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

/**
 * Foglio con il nome tradotto (T-2103) scritto con il WorkbookWriter di exceljs su uno stream di passaggio, con commit
 * di ogni riga. I valori sono numeri, booleani o stringhe (mai formule: un testo che inizia con = resta testo); null
 * resta una cella vuota. Con 0 righe il foglio è vuoto (T-406).
 */
function xlsxStream(
  rows: AsyncIterable<ExportRow>,
  labels: ExportLabels,
  onError: (error: unknown) => void
): ReadableStream<Uint8Array> {
  const output = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: false, useSharedStrings: false });
  const sheet = workbook.addWorksheet(labels.sheet);

  const write = async () => {
    let empty = true;
    for await (const row of rows) {
      if (empty) {
        sheet.addRow(labels.columns).commit();
        empty = false;
      }
      sheet.addRow(labels.cells(row)).commit();
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
    return xlsxStream(rows, exportLabels(params.locale), onError);
  }

  const chunks =
    params.format === "csv"
      ? csvChunks(rows, params.csvDialect ?? CSV_DIALECT_DEFAULT, exportLabels(params.locale))
      : jsonChunks(rows);
  return textStream(chunks, onError);
}
