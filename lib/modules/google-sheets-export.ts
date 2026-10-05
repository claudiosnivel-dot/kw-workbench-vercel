import type { Prisma } from "@/lib/generated/prisma/client";
import { AppError } from "@/lib/http/errors";
import { buildExportWhere, EXPORT_COLUMNS, ExportScope, iterateExportRows } from "@/lib/modules/export";
import { ResultsFilters } from "@/lib/modules/results-filters";
import { getDecryptedGoogleSheetsRefreshToken } from "@/lib/integrations/google-sheets";
import { getGoogleSheetsApiConfig } from "@/lib/integrations/google-sheets-config";
import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_REQUEST_TIMEOUT_MS = 30_000;
// Righe di dati per richiesta di scrittura (D-23): con l'intero set in una richiesta Google risponde 400.
const SHEETS_ROWS_PER_WRITE = 5000;
const INCOMPLETE_PREFIX = "[INCOMPLETO] ";
const MAX_SHEET_TITLE_LENGTH = 100;
const MAX_SPREADSHEET_TITLE_LENGTH = 120;

/** Errore dell'export verso Google Sheets: status e messaggio pubblico nel formato di T-503. */
export class GoogleSheetsExportError extends AppError {
  constructor(message: string, status = 400) {
    super(status, "GOOGLE_SHEETS_EXPORT_ERROR", message);
    this.name = "GoogleSheetsExportError";
  }
}

type SheetsGroup = {
  subprojectId: string;
  sheetTitle: string;
  rowCount: number;
};

type SheetCell = string | number | boolean;

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

/** Titoli univoci senza distinguere maiuscole e minuscole, come li confronta Google ('Generale' = 'generale'). */
function uniqueSheetTitles(rawTitles: string[]): string[] {
  const used = new Set<string>();
  const counters = new Map<string, number>();

  return rawTitles.map((rawTitle) => {
    const normalized = sanitizeSheetTitle(rawTitle);
    const key = normalized.toLowerCase();
    const currentCounter = (counters.get(key) ?? 0) + 1;
    counters.set(key, currentCounter);

    if (currentCounter === 1 && !used.has(key)) {
      used.add(key);
      return normalized;
    }

    let suffixCounter = currentCounter;
    while (true) {
      const suffix = ` (${suffixCounter})`;
      const maxBaseLength = Math.max(1, MAX_SHEET_TITLE_LENGTH - suffix.length);
      const trimmedBase = normalized.slice(0, maxBaseLength).trim() || "Sezione";
      const candidate = `${trimmedBase}${suffix}`;

      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        counters.set(key, suffixCounter);
        return candidate;
      }

      suffixCounter += 1;
    }
  });
}

function escapeRangeSheetTitle(sheetTitle: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

function normalizeCellValue(value: unknown): SheetCell {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return String(value);
}

/** Un foglio per ogni sezione con righe da esportare, in ordine di position della sezione e poi di nome. */
async function buildGroupedSheets(projectId: string, where: Prisma.KeywordCandidateWhereInput): Promise<SheetsGroup[]> {
  const counts = await prisma.keywordCandidate.groupBy({ by: ["subproject_id"], where, _count: { _all: true } });
  if (counts.length === 0) {
    return [];
  }

  const rowCounts = new Map(counts.map((item) => [item.subproject_id, item._count._all]));
  const sections = await prisma.subproject.findMany({
    where: { project_id: projectId, id: { in: [...rowCounts.keys()] } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const titles = uniqueSheetTitles(sections.map((section) => section.name.trim() || "Sezione"));

  return sections.map((section, index) => ({
    subprojectId: section.id,
    sheetTitle: titles[index],
    rowCount: rowCounts.get(section.id) ?? 0,
  }));
}

/** Ogni chiamata a Google ha un timeout di 30 s; rete o timeout diventano un errore pubblico senza dettagli. */
async function googleFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS) });
  } catch {
    throw new GoogleSheetsExportError("Google non ha risposto entro 30 secondi o non è raggiungibile.", 502);
  }
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

  const tokenResponse = await googleFetch(GOOGLE_TOKEN_ENDPOINT, {
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

async function createSpreadsheet(accessToken: string, title: string, groups: SheetsGroup[]): Promise<GoogleSheetsCreateResponse> {
  const response = await googleFetch(GOOGLE_SHEETS_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title },
      // Griglia dimensionata sulle righe da scrivere: le scritture successive alla prima partono oltre la riga 1000.
      sheets: groups.map((group) => ({
        properties: {
          title: group.sheetTitle,
          gridProperties: { rowCount: group.rowCount + 1, columnCount: EXPORT_COLUMNS.length },
        },
      })),
    }),
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

async function writeValues(accessToken: string, spreadsheetId: string, range: string, values: SheetCell[][]) {
  const response = await googleFetch(`${GOOGLE_SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [{ range, majorDimension: "ROWS", values }],
    }),
  });

  if (!response.ok) {
    throw new GoogleSheetsExportError(
      `Errore scrittura dati su Google Sheets (${response.status}).`,
      response.status >= 500 ? 502 : 400
    );
  }
}

/** Scrive le righe della sezione nel suo foglio in richieste da SHEETS_ROWS_PER_WRITE righe; l'intestazione solo nella prima. */
async function writeSheet(
  accessToken: string,
  spreadsheetId: string,
  group: SheetsGroup,
  where: Prisma.KeywordCandidateWhereInput
): Promise<number> {
  let pending: SheetCell[][] = [EXPORT_COLUMNS.map(String)];
  let pendingRows = 0;
  let nextRow = 1;
  let written = 0;

  const flush = async () => {
    await writeValues(accessToken, spreadsheetId, `${escapeRangeSheetTitle(group.sheetTitle)}!A${nextRow}`, pending);
    nextRow += pending.length;
    written += pendingRows;
    pending = [];
    pendingRows = 0;
  };

  for await (const row of iterateExportRows({ AND: [where, { subproject_id: group.subprojectId }] })) {
    pending.push(EXPORT_COLUMNS.map((column) => normalizeCellValue(row[column])));
    pendingRows += 1;
    if (pendingRows === SHEETS_ROWS_PER_WRITE) {
      await flush();
    }
  }

  if (pendingRows > 0) {
    await flush();
  }
  return written;
}

/**
 * File creato ma scrittura fallita: si elimina da Drive. Con lo scope attuale (spreadsheets, vedi T-907)
 * Drive risponde 403 o 404: il file resta, si rinomina con il prefisso «[INCOMPLETO] » e se ne restituisce
 * l'URL. Restituisce null se il file è stato eliminato.
 */
async function discardIncompleteSpreadsheet(
  accessToken: string,
  spreadsheet: { id: string; url: string; title: string }
): Promise<string | null> {
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const deleted = await googleFetch(`${GOOGLE_DRIVE_FILES}/${spreadsheet.id}`, { method: "DELETE", headers }).catch(
    () => null
  );
  if (deleted?.ok) {
    return null;
  }

  await googleFetch(`${GOOGLE_SHEETS_BASE}/${spreadsheet.id}:batchUpdate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requests: [
        {
          updateSpreadsheetProperties: {
            properties: { title: sanitizeSpreadsheetTitle(`${INCOMPLETE_PREFIX}${spreadsheet.title}`) },
            fields: "title",
          },
        },
      ],
    }),
  }).catch(() => null);
  return spreadsheet.url;
}

export async function exportProjectToGoogleSheets(params: {
  userId: string;
  projectId: string;
  scope: ExportScope;
  filters: ResultsFilters;
  fileName: string;
  subprojectId?: string | null;
}) {
  const where = buildExportWhere(params.projectId, params.scope, params.filters, params.subprojectId ?? null);
  const groups = await buildGroupedSheets(params.projectId, where);

  if (groups.length === 0) {
    throw new GoogleSheetsExportError("Nessuna keyword da esportare con i filtri e scope selezionati.", 400);
  }

  const accessToken = await refreshUserAccessToken(params.userId);
  const title = sanitizeSpreadsheetTitle(params.fileName);
  const spreadsheet = await createSpreadsheet(accessToken, title, groups);

  if (!spreadsheet.spreadsheetId) {
    throw new GoogleSheetsExportError("Google Sheets non ha restituito uno spreadsheetId valido.", 502);
  }

  const spreadsheetUrl =
    spreadsheet.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`;
  let exportedRows = 0;
  try {
    for (const group of groups) {
      exportedRows += await writeSheet(accessToken, spreadsheet.spreadsheetId, group, where);
    }
  } catch (error) {
    const leftUrl = await discardIncompleteSpreadsheet(accessToken, {
      id: spreadsheet.spreadsheetId,
      url: spreadsheetUrl,
      title,
    });
    if (!(error instanceof GoogleSheetsExportError)) {
      throw error;
    }
    throw new GoogleSheetsExportError(
      leftUrl
        ? `${error.message} Il file incompleto è rimasto su Google Drive con il prefisso «${INCOMPLETE_PREFIX.trim()}»: ${leftUrl}`
        : `${error.message} Il file incompleto è stato eliminato.`,
      error.status
    );
  }

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl,
    sheetCount: groups.length,
    exportedRows,
  };
}
