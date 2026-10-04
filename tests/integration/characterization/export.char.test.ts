// Caratterizzazione di T-107: formato attuale degli export CSV/XLSX/JSON (intestazioni,
// separatori, righe, header HTTP, semantica degli scope) prima della sostituzione di xlsx
// (T-406) e delle correzioni del CSV (T-804) e degli scope (T-807). L'XLSX si legge con
// exceljs, indipendente dalla libreria che lo scrive.
// Oracolo di non regressione degli upgrade di 04-stack-upgrade (snapshot invariati):
// covers: AC-401-3
// covers: AC-403-4
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { callRoute } from "../../helpers/http";

// Le 12 candidate della fixture: [brand_status, review_status, selected_for_export, search_intent].
const FIXTURE = [
  ["allowed", "approved", true, "commercial"],
  ["allowed", "approved", true, "informational"],
  ["allowed", "approved", false, "commercial"],
  ["allowed", "pending", true, "commercial"],
  ["allowed", "pending", true, "informational"],
  ["allowed", "pending", false, "transactional"],
  ["allowed", "rejected", false, "commercial"],
  ["excluded", "rejected", false, "commercial"],
  ["excluded", "rejected", false, "informational"],
  ["review", "pending", true, "commercial"],
  ["review", "approved", false, "navigational"],
  ["allowed", "pending", true, "mixed"],
] as const;

// Conteggi attesi per scope sulla fixture.
const EXPECTED = {
  approved: 4, // approved e non excluded
  selected: 6, // selected_for_export
  review: 5, // review_status pending
  "non-excluded": 10, // brand_status diverso da excluded, rifiutate comprese
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

function keywordFor(index: number): string {
  if (index === 6) return REJECTED_ALLOWED_KEYWORD;
  if (index === 11) return FORMULA_KEYWORD;
  return `candidata ${String(index + 1).padStart(2, "0")}`;
}

async function createOwnerProject(onboardingStatus?: "IN_PROGRESS") {
  const owner = await createUserWithSession({ username: "export-owner" });
  if (onboardingStatus) {
    await prisma.userOnboardingProgress.create({ data: { user_id: owner.user.id, status: onboardingStatus } });
  }
  const project = await prisma.project.create({ data: { name: "Export", owner_user_id: owner.user.id } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  return { owner, projectId: project.id, sectionId: section.id };
}

async function insertFixture(projectId: string, sectionId: string): Promise<void> {
  await prisma.keywordCandidate.createMany({
    data: FIXTURE.map(([brand_status, review_status, selected_for_export, search_intent], index) => {
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
        selected_for_export,
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
  it("CSV non-excluded: header HTTP, byte senza BOM, virgola, LF e virgolette su ogni valore", async () => {
    const response = await callRoute(exportProject, {
      url: exportUrl(projectId, "format=csv&scope=non-excluded"),
      cookie,
      params: { id: projectId },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    const lines = text.split("\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      new RegExp(`filename="seo-god-mode-${projectId}-project-non-excluded-\\d{4}-\\d{2}-\\d{2}\\.csv"`)
    );
    expect(Array.from(bytes.slice(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]); // impacted-by: T-804
    expect(text).not.toContain("\r");
    expect(lines[0]).toBe(HEADERS.join(","));
    expect(lines).toHaveLength(EXPECTED["non-excluded"] + 1);
    for (const line of lines.slice(1)) {
      expect(line).toMatch(/^"(?:[^"]|"")*"(?:,"(?:[^"]|"")*")*$/);
      expect(line.split('","')).toHaveLength(HEADERS.length);
    }
    // impacted-by: T-804
    expect(text).toContain(`"${FORMULA_KEYWORD}"`);
  });

  // covers: AC-107-2
  it("XLSX selected: un solo foglio keywords con le 22 intestazioni del CSV", async () => {
    const response = await callRoute(exportProject, {
      url: exportUrl(projectId, "format=xlsx&scope=selected"),
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
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["keywords"]);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(HEADERS);
    expect(sheet.actualRowCount - 1).toBe(EXPECTED.selected);
  });

  // covers: AC-107-3
  it("JSON: ogni scope restituisce il numero di righe dichiarato", async () => {
    for (const [scope, query] of [
      ["approved", "scope=approved"],
      ["selected", "scope=selected"],
      ["review", "scope=review"],
      ["non-excluded", "scope=non-excluded"],
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
      if (scope === "non-excluded") {
        // impacted-by: T-807
        expect(rows.find((row) => row.keyword === REJECTED_ALLOWED_KEYWORD)?.review_status).toBe("rejected");
      }
    }
  });
});

describe("caratterizzazione: export vuoto e onboarding", () => {
  // covers: AC-107-4
  it("CSV approved senza candidate: 0 byte senza intestazione e onboarding completato", async () => {
    const { owner, projectId: emptyProjectId } = await createOwnerProject("IN_PROGRESS");

    const response = await callRoute(exportProject, {
      url: exportUrl(emptyProjectId, "format=csv&scope=approved"),
      cookie: owner.cookie,
      params: { id: emptyProjectId },
    });

    expect(response.status).toBe(200);
    // impacted-by: T-804
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    const progress = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: owner.user.id } });
    // impacted-by: T-1003
    expect(progress.status).toBe("COMPLETED");
  });
});
