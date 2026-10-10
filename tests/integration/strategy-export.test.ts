// Gate di T-1906 (AC-1906-1…4): export della strategia in CSV ed Excel nell'ordine di lavoro con la protezione dalle
// formule, 404 fuori dal workspace e foglio «strategia» di Google Sheets uguale al CSV. Le API Google sono simulate.
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exportToSheets } from "@/app/api/projects/[id]/strategies/[strategyId]/export/google-sheets/route";
import { GET as exportStrategy } from "@/app/api/projects/[id]/strategies/[strategyId]/export/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { insertStrategy, type PlanPageSpec } from "../helpers/strategy";

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

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

const PAGES: PlanPageSpec[] = [
  {
    key: "hub",
    kind: "HUB",
    h1: "Scarpe running: la guida pratica",
    h2: ["Migliori scarpe running", "Scarpe running donna"],
    keywords: [{ text: "scarpe running", volume: 9900 }, { text: "scarpe da running", volume: 2400 }],
  },
  {
    key: "best",
    kind: "SPOKE",
    hub: "hub",
    h1: "Migliori scarpe running: classifica 2026",
    h2: ["Scarpe running recensioni", "Come abbiamo scelto"],
    keywords: [{ text: "migliori scarpe running", volume: 2900 }, { text: "scarpe running recensioni", volume: 390 }],
  },
  {
    key: "women",
    kind: "SPOKE",
    hub: "hub",
    h1: "Scarpe running donna: guida completa 2026",
    h2: [],
    keywords: [{ text: "scarpe running donna", volume: 2100 }],
  },
];

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllGlobals();
});

async function ownerStrategy(pages = PAGES) {
  const owner = await createUserWithSession({ displayName: `t1906-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({ data: { name: "Export", workspace_id: owner.workspaceId, language_code: "it" } });
  const { strategyId } = await insertStrategy({ projectId: project.id, pages, name: "Piano Q4" });
  return { owner, projectId: project.id, strategyId };
}

function download(session: Session, projectId: string, strategyId: string, query: string) {
  return callRoute(exportStrategy, {
    url: `/api/projects/${projectId}/strategies/${strategyId}/export?${query}`,
    cookie: session.cookie,
    params: { id: projectId, strategyId },
  });
}

/** Parser CSV minimo per i file dell'app: ogni campo tra doppi apici, apici interni raddoppiati, righe CRLF. */
function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\r" && body[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else {
      field += char;
    }
  }
  return rows;
}

describe("export della strategia", () => {
  // covers: AC-1906-1
  it("il CSV ha l'intestazione e una riga per pagina nell'ordine di lavoro, con H2 uniti e link interni", async () => {
    const { owner, projectId, strategyId } = await ownerStrategy();

    const response = await download(owner, projectId, strategyId, "format=csv");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="seo-god-mode-strategy-piano-q4-\d{4}-\d{2}-\d{2}\.csv"$/);
    const [header, ...rows] = parseCsv(await response.text(), ";");
    expect(header).toEqual([
      "hub", "page_type", "h1", "h2", "main_keyword", "secondary_keywords", "content_type", "volume", "priority", "internal_links",
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row[2])).toEqual([
      "Scarpe running: la guida pratica",
      "Migliori scarpe running: classifica 2026",
      "Scarpe running donna: guida completa 2026",
    ]);
    expect(rows.map((row) => row[3])).toEqual([
      "Migliori scarpe running | Scarpe running donna",
      "Scarpe running recensioni | Come abbiamo scelto",
      "",
    ]);
    expect(rows[0][9]).toBe("Migliori scarpe running: classifica 2026 | Scarpe running donna: guida completa 2026");
    expect(rows.slice(1).map((row) => row[9])).toEqual(["Scarpe running: la guida pratica", "Scarpe running: la guida pratica"]);
    expect(rows[1].slice(4, 8)).toEqual(["migliori scarpe running", "scarpe running recensioni", "guide", "3290"]);
  });

  // covers: AC-1906-2
  it("un H1 che inizia con = è protetto nel CSV come nell'export dei risultati e nell'XLSX è una cella di testo", async () => {
    const pages: PlanPageSpec[] = [{ key: "hub", kind: "HUB", h1: "=HYPERLINK(\"http://x\")", keywords: [{ text: "scarpe running", volume: 10 }] }];
    const { owner, projectId, strategyId } = await ownerStrategy(pages);

    const csv = await download(owner, projectId, strategyId, "format=csv&csvDialect=rfc4180");
    const xlsx = await download(owner, projectId, strategyId, "format=xlsx");

    const [, row] = parseCsv(await csv.text(), ",");
    expect(row[2]).toBe("'=HYPERLINK(\"http://x\")");
    expect(xlsx.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const cell = workbook.getWorksheet("strategia")!.getCell("C2");
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe("=HYPERLINK(\"http://x\")");
  });

  // covers: AC-1906-3
  it("un utente di un altro workspace riceve 404 e nessun file", async () => {
    const { projectId, strategyId } = await ownerStrategy();
    const outsider = await createUserWithSession({ displayName: "t1906-outsider" });

    const response = await download(outsider, projectId, strategyId, "format=csv");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(((await response.json()) as { code: string }).code).toBe("PROJECT_NOT_FOUND");
  });

  // covers: AC-1906-4
  it("su Google Sheets il foglio «strategia» riceve le stesse righe dell'export CSV", async () => {
    const { owner, projectId, strategyId } = await ownerStrategy();
    const csvRows = parseCsv(await (await download(owner, projectId, strategyId, "format=csv&csvDialect=rfc4180")).text(), ",");
    const written: { range: string; values: unknown[][] }[] = [];
    let createdSheets: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;
        const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: randomUUID(), token_type: "Bearer" });
        if (url === "https://sheets.googleapis.com/v4/spreadsheets") {
          createdSheets = body.sheets;
          return json({ spreadsheetId: "foglio", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/foglio/edit" });
        }
        if (url.endsWith("/foglio/values:batchUpdate")) {
          written.push(body.data[0]);
          return json({});
        }
        return new Response("{}", { status: 404 });
      })
    );

    const response = await callRoute(exportToSheets, {
      method: "POST",
      url: `/api/projects/${projectId}/strategies/${strategyId}/export/google-sheets`,
      cookie: owner.cookie,
      params: { id: projectId, strategyId },
      body: { fileName: "Strategia Q4" },
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { exportedRows: number } }).data.exportedRows).toBe(3);
    expect(createdSheets).toEqual([{ properties: { title: "strategia", gridProperties: { rowCount: 4, columnCount: 10 } } }]);
    expect(written.map((write) => write.range)).toEqual(["'strategia'!A1"]);
    expect(written[0].values.map((row) => row.map((cell) => String(cell)))).toEqual(csvRows);
  });
});
