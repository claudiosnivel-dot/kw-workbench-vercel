// Caratterizzazione di T-107: formato attuale degli export CSV/XLSX/JSON (intestazioni,
// separatori, righe, header HTTP, semantica degli scope) prima della sostituzione di xlsx
// (T-406) e delle correzioni del CSV (T-804) e degli scope (T-807). L'XLSX si legge con
// exceljs, indipendente dalla libreria che lo scrive.
// Oracolo di non regressione degli upgrade di 04-stack-upgrade (snapshot invariati):
// covers: AC-401-3
// covers: AC-403-4
// Oracolo di T-1102: il consolidamento dei duplicati non cambia il comportamento fotografato.
// covers: AC-1102-4
// impacted-by: T-2103 (intestazioni e nome del foglio nella lingua dell'utente, italiano di default; aggiornamento delle
// sole asserzioni su intestazioni e foglio confermato in anticipo dall'utente con D-37, 2026-10-11)
// impacted-by: T-2401, T-2402 (selected_for_export eliminata e scope kept, all e filtered al posto di approved, selected,
// review e non-excluded; aggiornamento delle sole asserzioni su selezione, scope e revisione confermato in anticipo
// dall'utente con D-39, 2026-10-13)
// Oracolo di T-2401: dopo la migrazione 0042 l'export non ha più la colonna della selezione.
// covers: AC-2401-1
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { EXPORT_COLUMNS } from "@/lib/modules/export";
import { prisma } from "@/lib/prisma";
import it_ from "@/messages/it.json";
import { createUserWithSession, personalWorkspaceId } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { callRoute } from "../../helpers/http";

// Le 12 candidate della fixture: [brand_status, review_status, search_intent] (impacted-by: T-2401, senza la selezione).
const FIXTURE = [
  ["allowed", "approved", "commercial"],
  ["allowed", "approved", "informational"],
  ["allowed", "approved", "commercial"],
  ["allowed", "pending", "commercial"],
  ["allowed", "pending", "informational"],
  ["allowed", "pending", "transactional"],
  ["allowed", "rejected", "commercial"],
  ["excluded", "rejected", "commercial"],
  ["excluded", "rejected", "informational"],
  ["review", "pending", "commercial"],
  ["review", "approved", "navigational"],
  ["allowed", "pending", "mixed"],
] as const;

// Conteggi attesi per scope sulla fixture (impacted-by: T-2402).
const EXPECTED = {
  kept: 9, // review_status diverso da rejected
  all: 12, // tutte, scartate comprese
  filtered: 6, // searchIntent=commercial
} as const;

const REJECTED_ALLOWED_KEYWORD = "candidata 07 rifiutata";
const FORMULA_KEYWORD = "=SOMMA(1;2) candidata 12";

const HEADERS = [
  "subproject_name",
  "keyword",
  "normalized_keyword",
  "canonical_keyword",
  "source",
  "source_query",
  "brand_status",
  "review_status",
  // impacted-by: T-2401 (selected_for_export eliminata)
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
].map((column) => it_.export.columns[column as keyof typeof it_.export.columns]); // impacted-by: T-2103 (etichette italiane)

function keywordFor(index: number): string {
  if (index === 6) return REJECTED_ALLOWED_KEYWORD;
  if (index === 11) return FORMULA_KEYWORD;
  return `candidata ${String(index + 1).padStart(2, "0")}`;
}

async function createOwnerProject() {
  const owner = await createUserWithSession({ displayName: "export-owner" });
  const project = await prisma.project.create({ data: { name: "Export", workspace_id: await personalWorkspaceId(owner.user.id) } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  return { owner, projectId: project.id, sectionId: section.id };
}

async function insertFixture(projectId: string, sectionId: string): Promise<void> {
  await prisma.keywordCandidate.createMany({
    data: FIXTURE.map(([brand_status, review_status, search_intent], index) => {
      const keyword = keywordFor(index);
      return {
        project_id: projectId,
        subproject_id: sectionId,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: keyword,
        brand_status,
        review_status,
        search_intent,
        score: 100 - index,
      };
    }),
  });
}

function exportUrl(projectId: string, query: string): string {
  return `/api/projects/${projectId}/export?${query}`;
}

let cookie: string;
let projectId: string;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("caratterizzazione: export della fixture di 12 candidate", () => {
  beforeEach(async () => {
    const created = await createOwnerProject();
    cookie = created.owner.cookie;
    projectId = created.projectId;
    await insertFixture(created.projectId, created.sectionId);
  });

  // covers: AC-107-1
  // Aggiornato da T-804 (impacted-by): dialetto excel-it predefinito con BOM, ';', CRLF e formule neutralizzate.
  // impacted-by: T-2402 (scope kept al posto di non-excluded, stesse 9 righe)
  it("CSV kept: header HTTP, BOM, punto e virgola, CRLF e virgolette su ogni valore", async () => {
    const response = await callRoute(exportProject, {
      url: exportUrl(projectId, "format=csv&scope=kept"),
      cookie,
      params: { id: projectId },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const lines = text.replace(/\r\n$/, "").split("\r\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    // covers: AC-2201-2
    // impacted-by: T-2201 (prefisso titan-seo del nome del file, D-38)
    expect(response.headers.get("content-disposition")).toMatch(
      new RegExp(`filename="titan-seo-${projectId}-project-kept-\\d{4}-\\d{2}-\\d{2}\\.csv"`)
    );
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // impacted-by: T-804
    expect(text.endsWith("\r\n")).toBe(true); // impacted-by: T-804
    expect(lines[0]).toBe(HEADERS.join(";")); // impacted-by: T-804
    expect(lines).toHaveLength(EXPECTED.kept + 1);
    for (const line of lines.slice(1)) {
      expect(line).toMatch(/^"(?:[^"]|"")*"(?:;"(?:[^"]|"")*")*$/); // impacted-by: T-804
      expect(line.split('";"')).toHaveLength(HEADERS.length);
    }
    // impacted-by: T-804
    expect(text).toContain(`"'${FORMULA_KEYWORD}"`);
  });

  // covers: AC-107-2
  // Aggiornato da T-707 (impacted-by): intestazioni con score_source.
  // impacted-by: T-2401, T-2402 (22 intestazioni senza la selezione, scope all al posto di selected)
  it("XLSX all: un solo foglio keywords con le 22 intestazioni del CSV", async () => {
    const response = await callRoute(exportProject, {
      url: exportUrl(projectId, "format=xlsx&scope=all"),
      cookie,
      params: { id: projectId },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.worksheets[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([it_.export.sheet]); // impacted-by: T-2103
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(HEADERS);
    expect(HEADERS).toHaveLength(22);
    expect(EXPORT_COLUMNS).not.toContain("selected_for_export");
    expect(sheet.actualRowCount - 1).toBe(EXPECTED.all);
  });

  // covers: AC-107-3
  it("JSON: ogni scope restituisce il numero di righe dichiarato", async () => {
    // impacted-by: T-2402 (scope kept, all e filtered)
    for (const [scope, query] of [
      ["kept", "scope=kept"],
      ["all", "scope=all"],
      ["filtered", "scope=filtered&searchIntent=commercial"],
    ] as const) {
      const response = await callRoute(exportProject, {
        url: exportUrl(projectId, `format=json&${query}`),
        cookie,
        params: { id: projectId },
      });
      const rows = (await response.json()) as { keyword: string; review_status: string }[];

      expect(response.status).toBe(200);
      expect(rows).toHaveLength(EXPECTED[scope]);
      if (scope === "kept") {
        // impacted-by: T-807, T-2402 (la scartata non è esportata da kept)
        expect(rows.find((row) => row.keyword === REJECTED_ALLOWED_KEYWORD)).toBeUndefined();
      }
    }
  });
});

describe("caratterizzazione: export vuoto", () => {
  // covers: AC-107-4
  // Aggiornato da T-804 (impacted-by): con 0 righe il file ha BOM e la sola intestazione.
  // Aggiornato da T-2306 (impacted-by): l'onboarding è rimosso, l'export non ne registra più il completamento.
  // impacted-by: T-2402 (scope kept al posto di approved)
  it("CSV kept senza candidate: BOM e sola intestazione", async () => {
    const { owner, projectId: emptyProjectId } = await createOwnerProject();

    const response = await callRoute(exportProject, {
      url: exportUrl(emptyProjectId, "format=csv&scope=kept"),
      cookie: owner.cookie,
      params: { id: emptyProjectId },
    });

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    // impacted-by: T-804
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(`${HEADERS.join(";")}\r\n`);
  });
});
