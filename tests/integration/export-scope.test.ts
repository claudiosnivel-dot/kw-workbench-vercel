// Gate di T-807 (AC-807-3, AC-807-4): gli scope di export rispettano revisione, sezione e filtri della
// vista, con lo stesso where per l'export file e per Google Sheets (API Google simulate).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as exportToSheets } from "@/app/api/projects/[id]/export/google-sheets/route";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import type { BrandStatus, ReviewStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

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

// [keyword, review_status, brand_status, selected_for_export]
const ROWS: [string, ReviewStatus, BrandStatus, boolean][] = [
  ["scarpe running", "approved", "allowed", true], // r1
  ["borsa pelle", "approved", "allowed", true], // r2
  ["scarpe nike", "approved", "excluded", false], // r3
  ["scarpe trail", "pending", "allowed", true], // r4
  ["borsa gucci", "pending", "review", true], // r5
  ["scarpe usate", "rejected", "allowed", true], // r6
  ["borsa usata", "rejected", "allowed", false], // r7
];

let cookie: string;
let projectId: string;
let sectionId: string;

async function exportedKeywords(query: string): Promise<string[]> {
  const response = await callRoute(exportProject, {
    url: `/api/projects/${projectId}/export?format=json&subprojectId=${sectionId}&${query}`,
    cookie,
    params: { id: projectId },
  });
  expect(response.status).toBe(200);
  const rows = (await response.json()) as { keyword: string }[];
  return rows.map((row) => row.keyword).sort();
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  const owner = await createUserWithSession({ displayName: "t807-owner" });
  const project = await prisma.project.create({
    data: { name: "Scope", workspace_id: await personalWorkspaceId(owner.user.id), language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  cookie = owner.cookie;
  projectId = project.id;
  sectionId = section.id;
  await prisma.keywordCandidate.createMany({
    data: ROWS.map(([keyword, review_status, brand_status, selected_for_export]) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
      review_status,
      brand_status,
      selected_for_export,
    })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scope di export e vista corrente", () => {
  // covers: AC-807-3
  it("ogni scope interseca revisione, sezione e filtri", async () => {
    expect(await exportedKeywords("scope=non-excluded")).toEqual(
      ["scarpe running", "borsa pelle", "scarpe trail", "borsa gucci"].sort()
    );
    expect(await exportedKeywords("scope=approved&searchText=scarpe")).toEqual(["scarpe running"]);
    expect(await exportedKeywords("scope=selected&searchText=scarpe")).toEqual(["scarpe running", "scarpe trail"].sort());
    expect(await exportedKeywords("scope=review")).toEqual(["scarpe trail", "borsa gucci"].sort());
    expect(await exportedKeywords("scope=filtered&searchText=scarpe")).toEqual(
      ["scarpe running", "scarpe nike", "scarpe trail", "scarpe usate"].sort()
    );
  });

  // covers: AC-807-4
  it("non-excluded esporta le stesse 4 righe in CSV e su Google Sheets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (payload: unknown) =>
          new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
        if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: randomUUID() });
        if (url === "https://sheets.googleapis.com/v4/spreadsheets") return json({ spreadsheetId: "foglio" });
        return json({});
      })
    );

    const csv = await callRoute(exportProject, {
      url: `/api/projects/${projectId}/export?format=csv&scope=non-excluded&subprojectId=${sectionId}`,
      cookie,
      params: { id: projectId },
    });
    const sheets = await callRoute(exportToSheets, {
      method: "POST",
      url: `/api/projects/${projectId}/export/google-sheets`,
      cookie,
      params: { id: projectId },
      body: { fileName: "Scope", scope: "non-excluded", subprojectId: sectionId, filters: {} },
    });
    const sheetsBody = (await sheets.json()) as { data: { exportedRows: number } };

    expect(csv.status).toBe(200);
    expect((await csv.text()).replace(/\r\n$/, "").split("\r\n")).toHaveLength(5);
    expect(sheets.status).toBe(200);
    expect(sheetsBody.data.exportedRows).toBe(4);
  });
});
