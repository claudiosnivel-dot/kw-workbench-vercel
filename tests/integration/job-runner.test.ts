// Gate di T-706 (AC-706-1…AC-706-4): job senza seed falliti senza scritture, transazione con timeout
// esplicito, messaggi d'errore pubblici e troncati, dettaglio solo nel log.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// La pipeline resta quella vera; AC-706-3 e AC-706-4 la sostituiscono per un solo run.
vi.mock("@/lib/modules/pipeline/extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/pipeline/extraction")>();
  return { ...actual, runExtractionPipeline: vi.fn(actual.runExtractionPipeline) };
});

// Autocomplete mock: un solo suggerimento per query, oppure SUGGESTIONS_PER_QUERY suggerimenti diversi.
const autocomplete = vi.hoisted(() => ({ suggestionsPerQuery: 1 }));
vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) =>
      Array.from({ length: autocomplete.suggestionsPerQuery }, (_, index) => ({
        keyword: `${query} variante ${index}`,
        source: "mock-autocomplete",
        sourceQuery: query,
      })),
  }),
}));

const pipeline = vi.mocked(runExtractionPipeline);
const NO_SEEDS_MESSAGE = "La sezione non ha seed: aggiungi almeno una seed prima di avviare l'estrazione";

async function createSection(seeds: string[]) {
  const { user } = await createUserWithSession({ username: "t706-owner" });
  const project = await prisma.project.create({
    data: {
      name: "Job T-706",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "NONE",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  for (const keyword of seeds) {
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword } });
  }
  return { projectId: project.id, sectionId: section.id };
}

async function runSection(projectId: string, sectionId: string) {
  const { job } = await enqueueExtractionJob(projectId, sectionId);
  await runJobById(job.id);
  return prisma.job.findUniqueOrThrow({ where: { id: job.id } });
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

beforeEach(async () => {
  autocomplete.suggestionsPerQuery = 1;
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sezione senza seed", () => {
  // covers: AC-706-1
  it("il job è failed con il messaggio pubblico e le 37 candidate precedenti restano", async () => {
    const { projectId, sectionId } = await createSection([]);
    await prisma.keywordCandidate.createMany({
      data: Array.from({ length: 37 }, (_, index) => ({
        project_id: projectId,
        subproject_id: sectionId,
        keyword: `precedente ${index}`,
        normalized_keyword: `precedente ${index}`,
        canonical_keyword: `precedente ${index}`,
        source: "seed",
        source_query: `precedente ${index}`,
      })),
    });
    const idsBefore = (await prisma.keywordCandidate.findMany({ where: { subproject_id: sectionId }, select: { id: true } }))
      .map((row) => row.id)
      .sort();
    captureStdout();

    const job = await runSection(projectId, sectionId);

    expect(job.status).toBe("failed");
    expect(job.error_message).toBe(NO_SEEDS_MESSAGE);
    const idsAfter = (await prisma.keywordCandidate.findMany({ where: { subproject_id: sectionId }, select: { id: true } }))
      .map((row) => row.id)
      .sort();
    expect(idsAfter).toHaveLength(37);
    expect(idsAfter).toEqual(idsBefore);
  });
});

describe("transazione finale", () => {
  // covers: AC-706-2
  it("riceve timeout 60000 e maxWait 10000 e salva 3000 candidate", async () => {
    // 1 seed senza espansioni: 1 query con 2999 suggerimenti più la seed stessa.
    autocomplete.suggestionsPerQuery = 2999;
    const { projectId, sectionId } = await createSection(["caffe"]);
    const transaction = vi.spyOn(prisma, "$transaction");

    const job = await runSection(projectId, sectionId);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toMatchObject({ timeout: 60000, maxWait: 10000 });
    expect(job.status).toBe("completed");
    expect((job.result as { storedCandidates?: number }).storedCandidates).toBe(3000);
    expect(await prisma.keywordCandidate.count({ where: { subproject_id: sectionId } })).toBe(3000);
  });
});

describe("errori della pipeline", () => {
  // covers: AC-706-3
  it("un errore Prisma salva solo il codice e scrive una riga di log con l'id del job", async () => {
    pipeline.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on host=db.internal.example port=5432", {
        code: "P2002",
        clientVersion: "7.10.0",
      })
    );
    const { projectId, sectionId } = await createSection(["caffe"]);
    const written = captureStdout();

    const job = await runSection(projectId, sectionId);

    expect(job.status).toBe("failed");
    expect(job.error_message).toContain("P2002");
    expect(job.error_message).not.toContain("db.internal.example");
    // Da T-602 il log è il logger JSON su stdout, non console.error: una sola riga di errore con l'id del job.
    const lines = errorLines(written);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(job.id);
  });

  // covers: AC-706-4
  it("un messaggio di 2000 caratteri è salvato troncato a 500", async () => {
    pipeline.mockRejectedValueOnce(new Error("x".repeat(2000)));
    const { projectId, sectionId } = await createSection(["caffe"]);
    captureStdout();

    const job = await runSection(projectId, sectionId);

    expect(job.status).toBe("failed");
    expect(job.error_message?.length).toBeLessThanOrEqual(500);
  });
});
