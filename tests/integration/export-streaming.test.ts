// Gate di T-805 (AC-805-1…4): l'export si scrive in streaming leggendo a blocchi di 1000 righe, così
// non si ferma al limite delle risposte Vercel e non tiene in memoria l'intero set; un errore
// dell'onboarding non rompe un export già generato e un utente senza accesso non legge nulla.
// Gate di T-2103 (AC-2103-1): intestazioni e valori del CSV nella lingua dell'utente, sì/no come Sì/No.
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as postLocale } from "@/app/api/locale/route";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { EXPORT_COLUMNS } from "@/lib/modules/export";
import { markOnboardingExportCompleted } from "@/lib/onboarding/progress";
import { prisma } from "@/lib/prisma";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

vi.mock("@/lib/onboarding/progress", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onboarding/progress")>()),
  markOnboardingExportCompleted: vi.fn(async () => undefined),
}));

const ROWS = 30_000;
// L'unica riga con metriche reali: per RESULTS_ORDER_BY (D-18) è la prima dell'export.
const FIRST_KEYWORD = "scarpe running misurata";
const TIMEOUT_MS = 120_000;

let ownerCookie: string;
let projectId: string;

function exportUrl(format: "csv" | "xlsx" | "json"): string {
  return `/api/projects/${projectId}/export?format=${format}&scope=filtered`;
}

function csvLines(text: string): string[] {
  return text.replace(/\r\n$/, "").split("\r\n");
}

function captureStdout(): string[] {
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
  return written;
}

function errorLines(written: string[]): string[] {
  return written
    .join("")
    .split("\n")
    .filter((line) => line.startsWith("{") && (JSON.parse(line) as { level?: string }).level === "error");
}

beforeAll(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  await resetDatabase();
  const owner = await createUserWithSession({ displayName: "t805-owner" });
  ownerCookie = owner.cookie;
  const project = await prisma.project.create({
    data: { name: "Streaming", workspace_id: await personalWorkspaceId(owner.user.id), language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  projectId = project.id;

  for (let start = 0; start < ROWS; start += 5000) {
    await prisma.keywordCandidate.createMany({
      data: Array.from({ length: 5000 }, (_, offset) => {
        const index = start + offset;
        const keyword = index === 0 ? FIRST_KEYWORD : `keyword ${String(index).padStart(5, "0")}`;
        return {
          project_id: project.id,
          subproject_id: section.id,
          keyword,
          normalized_keyword: keyword,
          canonical_keyword: keyword,
          source: "seed",
          source_query: keyword,
          score: index === 0 ? 10 : index % 90,
          score_source: index === 0 ? ("metrics" as const) : ("heuristic" as const),
        };
      }),
    });
  }
}, TIMEOUT_MS);

afterAll(async () => {
  vi.unstubAllEnvs();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("export in streaming", () => {
  // covers: AC-805-1
  it(
    "CSV: 200 senza content-length, body ReadableStream, 30.001 righe e findMany con take al massimo 1000",
    async () => {
      const findMany = vi.spyOn(prisma.keywordCandidate, "findMany");

      const response = await callRoute(exportProject, { url: exportUrl("csv"), cookie: ownerCookie, params: { id: projectId } });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-length")).toBeNull();
      expect(response.body).toBeInstanceOf(ReadableStream);
      expect(csvLines(await response.text())).toHaveLength(ROWS + 1);
      expect(findMany.mock.calls.length).toBeGreaterThan(0);
      expect(findMany.mock.calls.every(([args]) => typeof args?.take === "number" && args.take <= 1000)).toBe(true);
    },
    TIMEOUT_MS
  );

  // covers: AC-805-2
  // Aggiornato da T-2103 (impacted-by): il foglio ha il nome di export.sheet nella lingua dell'utente.
  it(
    "XLSX con il foglio delle keyword di 30.001 righe e JSON di 30.000 elementi nell'ordine dei risultati",
    async () => {
      const xlsx = await callRoute(exportProject, { url: exportUrl("xlsx"), cookie: ownerCookie, params: { id: projectId } });
      const json = await callRoute(exportProject, { url: exportUrl("json"), cookie: ownerCookie, params: { id: projectId } });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await xlsx.arrayBuffer());
      const rows = JSON.parse(await json.text()) as { keyword: string }[];

      expect(xlsx.status).toBe(200);
      expect(workbook.getWorksheet(it_.export.sheet)?.actualRowCount).toBe(ROWS + 1);
      expect(json.status).toBe(200);
      expect(rows).toHaveLength(ROWS);
      expect(rows[0].keyword).toBe(FIRST_KEYWORD);
    },
    TIMEOUT_MS
  );

  // covers: AC-805-3
  it("al primo chunk del CSV findMany è stato chiamato al massimo 2 volte", async () => {
    const findMany = vi.spyOn(prisma.keywordCandidate, "findMany");

    const response = await callRoute(exportProject, { url: exportUrl("csv"), cookie: ownerCookie, params: { id: projectId } });
    const reader = response.body!.getReader();
    const first = await reader.read();
    const callsAtFirstChunk = findMany.mock.calls.length;
    await reader.cancel();

    expect(first.done).toBe(false);
    expect(first.value?.byteLength).toBeGreaterThan(0);
    expect(callsAtFirstChunk).toBeLessThanOrEqual(2);
    // Una lettura completa sarebbe una findMany senza take.
    expect(findMany.mock.calls.every(([args]) => (args?.take ?? Number.POSITIVE_INFINITY) <= 1000)).toBe(true);
  });

  // DoD di T-805: un errore del DB a metà chiude lo stream con errore, mai un file troncato con 200 completo.
  it("un errore del DB al secondo blocco chiude lo stream in errore e finisce nel log", async () => {
    const realFindMany = prisma.keywordCandidate.findMany.bind(prisma.keywordCandidate);
    let calls = 0;
    vi.spyOn(prisma.keywordCandidate, "findMany").mockImplementation(((args: Parameters<typeof realFindMany>[0]) => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error("connessione al DB persa")) : realFindMany(args);
    }) as typeof realFindMany);
    const written = captureStdout();

    const response = await callRoute(exportProject, { url: exportUrl("csv"), cookie: ownerCookie, params: { id: projectId } });

    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow();
    expect(errorLines(written).filter((line) => line.includes("export_stream_failed"))).toHaveLength(1);
  });

  // covers: AC-805-4
  it(
    "un errore dell'onboarding non cambia l'export del proprietario; un altro utente riceve 404 senza letture",
    async () => {
      vi.mocked(markOnboardingExportCompleted).mockRejectedValueOnce(new Error("onboarding non aggiornato"));
      const intruder = await createUserWithSession({ displayName: "t805-intruder" });
      const written = captureStdout();

      const ownerResponse = await callRoute(exportProject, { url: exportUrl("csv"), cookie: ownerCookie, params: { id: projectId } });
      const ownerLines = csvLines(await ownerResponse.text());
      const ownerErrors = errorLines(written);

      const findMany = vi.spyOn(prisma.keywordCandidate, "findMany");
      const intruderResponse = await callRoute(exportProject, {
        url: exportUrl("csv"),
        cookie: intruder.cookie,
        params: { id: projectId },
      });

      expect(ownerResponse.status).toBe(200);
      expect(ownerLines).toHaveLength(ROWS + 1);
      // Il log degli errori è il logger JSON di T-602 su stdout (come per AC-706-3), non console.error.
      expect(ownerErrors).toHaveLength(1);
      expect(ownerErrors[0]).toContain("onboarding non aggiornato");
      expect(intruderResponse.status).toBe(404);
      expect(intruderResponse.headers.get("content-type")).toContain("application/json");
      expect(findMany).not.toHaveBeenCalled();
    },
    TIMEOUT_MS
  );
});

describe("export CSV nella lingua dell'utente (T-2103)", () => {
  // covers: AC-2103-1
  it("intestazioni, stato di revisione e Sì in italiano; dopo il passaggio all'inglese le traduzioni inglesi e Yes", async () => {
    const owner = await createUserWithSession({ displayName: "t2103-csv" });
    const project = await prisma.project.create({ data: { name: "Lingua", workspace_id: owner.workspaceId } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    const keyword = "migliori scarpe running";
    await prisma.keywordCandidate.create({
      data: {
        project_id: project.id,
        subproject_id: section.id,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: keyword,
        review_status: "approved",
        search_intent: "commercial",
        is_question: true,
      },
    });
    const chooseLocale = (locale: string) =>
      callRoute(postLocale, { method: "POST", url: "/api/locale", cookie: owner.cookie, body: { locale } });
    const download = async () => {
      const response = await callRoute(exportProject, {
        url: `/api/projects/${project.id}/export?format=csv&scope=approved`,
        cookie: owner.cookie,
        params: { id: project.id },
      });
      return csvLines(await response.text());
    };
    const header = (line: string) => line.replace(/^\uFEFF/, "").split(";");
    const cell = (line: string, column: (typeof EXPORT_COLUMNS)[number]) => line.slice(1, -1).split('";"')[EXPORT_COLUMNS.indexOf(column)];

    expect((await chooseLocale("it")).status).toBe(200);
    const italian = await download();
    expect((await chooseLocale("en")).status).toBe(200);
    const english = await download();

    expect(header(italian[0])).toEqual(EXPORT_COLUMNS.map((column) => it_.export.columns[column]));
    expect(header(italian[0])).toHaveLength(23);
    expect(cell(italian[1], "review_status")).toBe(it_.results.review.approved);
    expect(cell(italian[1], "is_question")).toBe("Sì");
    expect(header(english[0])).toEqual(EXPORT_COLUMNS.map((column) => en.export.columns[column]));
    expect(cell(english[1], "review_status")).toBe(en.results.review.approved);
    expect(cell(english[1], "is_question")).toBe("Yes");
  });
});
