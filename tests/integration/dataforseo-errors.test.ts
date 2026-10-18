// Gate di T-3704 (AC-3704-2, D-45): una richiesta dei volumi rifiutata da DataForSEO lascia nell'esito della ricerca
// lo status HTTP e il codice del fornitore, mai il suo messaggio. Fetch del fornitore simulato, nessuna chiamata reale.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { loadLastCompletedSearch } from "@/lib/modules/keywords-page";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const PROVIDER_MESSAGE = "Please verify your account before using the API.";

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      ["letto ospedaliero elettrico", "letto ospedaliero usato"].map((keyword) => ({
        keyword,
        source: "mock-autocomplete",
        sourceQuery: query,
      })),
  }),
}));

// Risposta di DataForSEO per un account non verificato, come quella osservata il 2026-10-18.
const fetchMock = vi.fn(async (input: string | URL | Request) => {
  if (!String(input).includes("api.dataforseo.com")) {
    return new Response("{}", { status: 404 });
  }
  return Response.json({ status_code: 40104, status_message: PROVIDER_MESSAGE, tasks: null }, { status: 403 });
});

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  // Tetti di spesa come in produzione (0 = nessuna richiesta, T-903).
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "0.9");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "0.3");
  fetchMock.mockClear();
});

describe("volumi di DataForSEO non riusciti", () => {
  // covers: AC-3704-2
  it("il job finisce completed con metricsProviderError { httpStatus 403, code 40104 } e i log senza il messaggio", async () => {
    const { user } = await createUserWithSession({ displayName: "t3704-root", isRootAdmin: true });
    const project = await prisma.project.create({
      data: {
        name: "Volumi",
        workspace_id: await personalWorkspaceId(user.id),
        language_code: "it",
        country_code: "IT",
        autocomplete_provider: "MOCK",
        metrics_provider: "DATAFORSEO",
        expand_alpha: false,
        expand_numeric: false,
        expand_patterns: false,
      },
    });
    const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Letti", position: 0 } });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: "letto ospedaliero" } });
    const lines: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });

    const { job } = await enqueueExtractionJob(project.id, topic.id);
    await runJobById(job.id).finally(() => stdout.mockRestore());

    const finished = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished.status).toBe("completed");
    expect((finished.result as { metricsProviderError?: unknown }).metricsProviderError).toEqual({ httpStatus: 403, code: 40104 });
    const keywords = await prisma.keywordCandidate.findMany({ where: { subproject_id: topic.id }, select: { metrics_status: true } });
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.every((keyword) => keyword.metrics_status === "failed")).toBe(true);
    const requests = lines
      .filter((line) => line.includes('"msg":"dataforseo_request"'))
      .map((line) => JSON.parse(line) as { code?: number });
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((entry) => entry.code === 40104)).toBe(true);
    expect(lines.filter((line) => line.includes("Please verify"))).toEqual([]);
    expect(JSON.stringify(finished.result)).not.toContain("Please verify");
    // La pagina dell'argomento legge lo stesso motivo dall'ultima ricerca completata.
    expect(await loadLastCompletedSearch(project.id, topic.id)).toEqual({ volumesReason: { kind: "provider", code: 40104 } });
  });
});
