// Gate di T-807 (AC-807-3, AC-807-4): gli scope di export rispettano revisione, sezione e filtri della
// vista, con lo stesso where per l'export file e per Google Sheets (API Google simulate).
// impacted-by: T-2402 (D-23 emendata: scope kept, all e filtered; AC-807-3 e AC-807-4 emendati), T-2401 (senza selezione)
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

// [keyword, review_status, brand_status]
const ROWS: [string, ReviewStatus, BrandStatus][] = [
  ["scarpe running", "approved", "allowed"], // r1
  ["borsa pelle", "approved", "allowed"], // r2
  ["scarpe nike", "approved", "excluded"], // r3, marchio escluso tenuto a mano
  ["scarpe trail", "pending", "allowed"], // r4
  ["borsa gucci", "pending", "review"], // r5
  ["scarpe usate", "rejected", "allowed"], // r6
  ["borsa usata", "rejected", "allowed"], // r7
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
    data: ROWS.map(([keyword, review_status, brand_status]) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
      review_status,
      brand_status,
    })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scope di export e vista corrente", () => {
  // covers: AC-807-3
  it("kept e all ignorano i filtri della vista, filtered li applica tutti", async () => {
    const kept = ["scarpe running", "borsa pelle", "scarpe nike", "scarpe trail", "borsa gucci"].sort();
    expect(await exportedKeywords("scope=kept")).toEqual(kept);
    expect(await exportedKeywords("scope=kept&searchText=scarpe")).toEqual(kept);
    expect(await exportedKeywords("scope=all&searchText=scarpe")).toEqual(ROWS.map(([keyword]) => keyword).sort());
    expect(await exportedKeywords("scope=filtered&searchText=scarpe")).toEqual(
      ["scarpe running", "scarpe nike", "scarpe trail", "scarpe usate"].sort()
    );
    expect(await exportedKeywords("scope=filtered&searchText=scarpe&status=kept")).toEqual(
      ["scarpe running", "scarpe nike", "scarpe trail"].sort()
    );
  });

  // covers: AC-807-4
  it("kept esporta le stesse 5 righe in CSV e su Google Sheets", async () => {
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
      url: `/api/projects/${projectId}/export?format=csv&scope=kept&subprojectId=${sectionId}`,
      cookie,
      params: { id: projectId },
    });
    const sheets = await callRoute(exportToSheets, {
      method: "POST",
      url: `/api/projects/${projectId}/export/google-sheets`,
      cookie,
      params: { id: projectId },
      body: { fileName: "Scope", scope: "kept", subprojectId: sectionId, filters: {} },
    });
    const sheetsBody = (await sheets.json()) as { data: { exportedRows: number } };

    expect(csv.status).toBe(200);
    expect((await csv.text()).replace(/\r\n$/, "").split("\r\n")).toHaveLength(6);
    expect(sheets.status).toBe(200);
    expect(sheetsBody.data.exportedRows).toBe(5);
  });
});
