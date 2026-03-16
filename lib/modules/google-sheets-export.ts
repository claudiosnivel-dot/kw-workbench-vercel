import { ExportRow, ExportScope, getExportRows } from "@/lib/modules/export";
import { ResultsFilters } from "@/lib/modules/results-filters";
import { getDecryptedGoogleSheetsRefreshToken } from "@/lib/integrations/google-sheets";
import { getGoogleSheetsApiConfig } from "@/lib/integrations/google-sheets-config";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_SHEET_TITLE_LENGTH = 100;
const MAX_SPREADSHEET_TITLE_LENGTH = 120;

export class GoogleSheetsExportError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GoogleSheetsExportError";
    this.status = status;
  }
}

type SheetsGroup = {
  sectionName: string;
  sheetTitle: string;
  rows: ExportRow[];
};

type GoogleSheetsCreateResponse = {
  spreadsheetId: string;
  spreadsheetUrl?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

const EXPORT_COLUMNS: Array<keyof ExportRow> = [
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
];

function sanitizeSpreadsheetTitle(input: string): string {
  const cleaned = String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "SEO God Mode Export";
  }

  if (cleaned.length <= MAX_SPREADSHEET_TITLE_LENGTH) {
    return cleaned;
  }

  return cleaned.slice(0, MAX_SPREADSHEET_TITLE_LENGTH).trim() || "SEO God Mode Export";
}

function sanitizeSheetTitle(input: string): string {
  const base = String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\[\]\*\?\\/\:]/g, " ")
    .replace(/^'+|'+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const fallback = base || "Sezione";
  if (fallback.length <= MAX_SHEET_TITLE_LENGTH) {
    return fallback;
  }

  return fallback.slice(0, MAX_SHEET_TITLE_LENGTH).trim() || "Sezione";
}

function uniqueSheetTitles(rawTitles: string[]): string[] {
  const used = new Set<string>();
  const counters = new Map<string, number>();

  return rawTitles.map((rawTitle) => {
    const normalized = sanitizeSheetTitle(rawTitle);
    const currentCounter = (counters.get(normalized) ?? 0) + 1;
    counters.set(normalized, currentCounter);

    if (currentCounter === 1 && !used.has(normalized)) {
      used.add(normalized);
      return normalized;
    }

    let suffixCounter = currentCounter;
    while (true) {
      const suffix = ` (${suffixCounter})`;
      const maxBaseLength = Math.max(1, MAX_SHEET_TITLE_LENGTH - suffix.length);
      const trimmedBase = normalized.slice(0, maxBaseLength).trim() || "Sezione";
      const candidate = `${trimmedBase}${suffix}`;

      if (!used.has(candidate)) {
        used.add(candidate);
        counters.set(normalized, suffixCounter);
        return candidate;
      }

      suffixCounter += 1;
    }
  });
}

function escapeRangeSheetTitle(sheetTitle: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return String(value);
}

function buildGroupedSheets(rows: ExportRow[]): SheetsGroup[] {
  const grouped = new Map<string, ExportRow[]>();

  for (const row of rows) {
    const sectionName = String(row.subproject_name ?? "").trim() || "Sezione";
    if (!grouped.has(sectionName)) {
      grouped.set(sectionName, []);
    }

    grouped.get(sectionName)!.push(row);
  }

  const entries = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, "it", { sensitivity: "base" }));
  const titles = uniqueSheetTitles(entries.map(([sectionName]) => sectionName));

  return entries.map(([sectionName, groupRows], index) => ({
    sectionName,
    sheetTitle: titles[index],
    rows: groupRows,
  }));
}

async function refreshUserAccessToken(userId: string): Promise<string> {
  const refreshToken = await getDecryptedGoogleSheetsRefreshToken(userId);
  if (!refreshToken) {
    throw new GoogleSheetsExportError("Collega Google Sheets in Personalizza prima di esportare.", 400);
  }

  const config = await getGoogleSheetsApiConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new GoogleSheetsExportError("Configurazione OAuth Google Sheets mancante. Contatta l'admin principale.", 400);
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });

  const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new GoogleSheetsExportError(
      tokenPayload.error_description || tokenPayload.error || "Impossibile ottenere access token Google Sheets",
      400
    );
  }

  return tokenPayload.access_token;
}

async function createSpreadsheet(accessToken: string, title: string, sheetTitles: string[]): Promise<GoogleSheetsCreateResponse> {
  const response = await fetch(GOOGLE_SHEETS_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetTitles.map((sheetTitle) => ({
        properties: { title: sheetTitle },
      })),
    }),
    cache: "no-store",
  });

  const payloadText = await response.text();
  if (!response.ok) {
    throw new GoogleSheetsExportError(
      `Errore creazione file Google Sheets (${response.status}).`,
      response.status >= 500 ? 502 : 400
    );
  }

  try {
    return JSON.parse(payloadText) as GoogleSheetsCreateResponse;
  } catch {
    throw new GoogleSheetsExportError("Risposta non valida da Google Sheets durante la creazione file.", 502);
  }
}

async function writeSheetValues(accessToken: string, spreadsheetId: string, groups: SheetsGroup[]) {
  const valuesData = groups.map((group) => {
    const headerRow = EXPORT_COLUMNS.map((column) => String(column));
    const dataRows = group.rows.map((row) =>
      EXPORT_COLUMNS.map((column) => normalizeCellValue(row[column]))
    );

    return {
      range: `${escapeRangeSheetTitle(group.sheetTitle)}!A1`,
      majorDimension: "ROWS",
      values: [headerRow, ...dataRows],
    };
  });

  const response = await fetch(`${GOOGLE_SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: valuesData,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GoogleSheetsExportError(
      `Errore scrittura dati su Google Sheets (${response.status}).`,
      response.status >= 500 ? 502 : 400
    );
  }
}

export async function exportProjectToGoogleSheets(params: {
  userId: string;
  projectId: string;
  scope: ExportScope;
  filters: ResultsFilters;
  fileName: string;
  subprojectId?: string | null;
}) {
  const rows = await getExportRows({
    projectId: params.projectId,
    subprojectId: params.subprojectId ?? null,
    scope: params.scope,
    filters: params.filters,
  });

  if (rows.length === 0) {
    throw new GoogleSheetsExportError("Nessuna keyword da esportare con i filtri e scope selezionati.", 400);
  }

  const groupedSheets = buildGroupedSheets(rows);
  const accessToken = await refreshUserAccessToken(params.userId);
  const spreadsheet = await createSpreadsheet(
    accessToken,
    sanitizeSpreadsheetTitle(params.fileName),
    groupedSheets.map((group) => group.sheetTitle)
  );

  if (!spreadsheet.spreadsheetId) {
    throw new GoogleSheetsExportError("Google Sheets non ha restituito uno spreadsheetId valido.", 502);
  }

  await writeSheetValues(accessToken, spreadsheet.spreadsheetId, groupedSheets);

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl: spreadsheet.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
    sheetCount: groupedSheets.length,
    exportedRows: rows.length,
  };
}