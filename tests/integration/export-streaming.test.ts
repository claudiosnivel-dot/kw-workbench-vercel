// Gate di T-805 (AC-805-1…4): l'export si scrive in streaming leggendo a blocchi di 1000 righe, così
// non si ferma al limite delle risposte Vercel e non tiene in memoria l'intero set; un errore
// dell'onboarding non rompe un export già generato e un utente senza accesso non legge nulla.
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { markOnboardingExportCompleted } from "@/lib/onboarding/progress";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
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
    data: { name: "Streaming", owner_user_id: owner.user.id, language_code: "it", country_code: "IT" },
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
  it(
    "XLSX con il foglio keywords di 30.001 righe e JSON di 30.000 elementi nell'ordine dei risultati",
    async () => {
      const xlsx = await callRoute(exportProject, { url: exportUrl("xlsx"), cookie: ownerCookie, params: { id: projectId } });
      const json = await callRoute(exportProject, { url: exportUrl("json"), cookie: ownerCookie, params: { id: projectId } });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await xlsx.arrayBuffer());
      const rows = JSON.parse(await json.text()) as { keyword: string }[];

      expect(xlsx.status).toBe(200);
      expect(workbook.getWorksheet("keywords")?.actualRowCount).toBe(ROWS + 1);
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
