// Gate di T-8302 (AC-8302-1…3, D-71): Claude Code sa quanto copre una ricerca. wait_for_job risponde con le domande a
// Google fatte e quelle tolte dal limite MAX_EXPANSION_QUERIES (dal cursore del lavoro) e, se il limite ne ha tolte, con
// una nota che consiglia create_topic; le istruzioni di initialize consigliano non oltre 5 parole di partenza per
// argomento e la descrizione di run_search dice che rifare la ricerca toglie le keyword non ritrovate.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { waitClock } from "@/lib/modules/agent/wait";
import { runJobById } from "@/lib/modules/jobs/job-runner";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey, rpc } from "../helpers/mcp";

// La ricerca non parte in background: wait_for_job la porta in fondo con i passi del lavoro.
vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

// Autocomplete simulato: un suggerimento per query, nessun volume.
vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) => [{ keyword: `${query} costo`, source: "mock-autocomplete", sourceQuery: query }],
  }),
}));

type Root = Awaited<ReturnType<typeof rootAdminWithKey>>;
type Waited = { status: string; finished: boolean; queries: { asked: number; skipped: number }; note?: string };

afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  resetEnvForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Progetto it-IT del root admin con un argomento e le parole di partenza date; composizioni, lettere e cifre attive. */
async function topicWithSeeds(root: Root, seeds: string[]) {
  const project = await prisma.project.create({
    data: {
      name: "Consulente del lavoro",
      workspace_id: root.workspaceId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "NONE",
      expand_alpha: true,
      expand_numeric: true,
      expand_patterns: true,
    },
  });
  const topic = await prisma.subproject.create({ data: { project_id: project.id, name: "Permessi", position: 0 } });
  await prisma.seed.createMany({ data: seeds.map((keyword) => ({ project_id: project.id, subproject_id: topic.id, keyword })) });
  return project.id;
}

/** run_search e poi wait_for_job con l'orologio finto: a ogni attesa la ricerca fa i suoi passi, fino in fondo. */
async function searchToTheEnd(root: Root, projectId: string) {
  const started = await callTool(root.key, "run_search", { projectId });
  expect(started.result?.isError).not.toBe(true);
  const jobId = (started.data as { jobId: string }).jobId;
  let elapsed = 0;
  vi.spyOn(waitClock, "now").mockImplementation(() => elapsed);
  vi.spyOn(waitClock, "sleep").mockImplementation(async (ms) => {
    elapsed += ms;
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (ACTIVE_JOB_STATUSES.includes(job.status)) await runJobById(jobId);
  });
  const waited = await callTool(root.key, "wait_for_job", { jobId });
  expect(waited.result?.isError).not.toBe(true);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  return { waited: waited.data as unknown as Waited, cursor: job.cursor as { queries: string[]; skippedQueries: number } };
}

describe("copertura della ricerca in wait_for_job", () => {
  // covers: AC-8302-1
  it("con MAX_EXPANSION_QUERIES 50 e 3 parole di partenza risponde con 50 domande fatte, quelle tolte del cursore e la nota", async () => {
    vi.stubEnv("MAX_EXPANSION_QUERIES", "50");
    resetEnvForTests();
    const root = await rootAdminWithKey("t8302-limit");
    const projectId = await topicWithSeeds(root, ["permessi 104", "straordinari", "tfr"]);

    const { waited, cursor } = await searchToTheEnd(root, projectId);

    expect(waited).toMatchObject({ status: "completed", finished: true });
    expect(cursor.queries).toHaveLength(50);
    expect(cursor.skippedQueries).toBeGreaterThan(0);
    expect(waited.queries).toEqual({ asked: 50, skipped: cursor.skippedQueries });
    expect(waited.note).toContain("create_topic");
  });

  // covers: AC-8302-2
  it("con 1 parola di partenza e il limite di default risponde con 0 domande tolte e nessuna nota", async () => {
    vi.stubEnv("MAX_EXPANSION_QUERIES", "250");
    resetEnvForTests();
    const root = await rootAdminWithKey("t8302-default");
    const projectId = await topicWithSeeds(root, ["permessi 104"]);

    const { waited, cursor } = await searchToTheEnd(root, projectId);

    expect(waited).toMatchObject({ status: "completed", finished: true });
    expect(cursor.queries.length).toBeGreaterThan(1);
    expect(waited.queries).toEqual({ asked: cursor.queries.length, skipped: 0 });
    expect(waited).not.toHaveProperty("note");
  });

  it("prima che la ricerca abbia calcolato le domande risponde con 0 e 0", async () => {
    const root = await rootAdminWithKey("t8302-pending");
    const projectId = await topicWithSeeds(root, ["permessi 104"]);
    const started = await callTool(root.key, "run_search", { projectId });
    const jobId = (started.data as { jobId: string }).jobId;
    // Il tempo passa senza che la ricerca faccia passi: la risposta arriva allo scadere dei 50 s.
    let elapsed = 0;
    vi.spyOn(waitClock, "now").mockImplementation(() => elapsed);
    vi.spyOn(waitClock, "sleep").mockImplementation(async (ms) => {
      elapsed += ms;
    });

    const { data } = await callTool(root.key, "wait_for_job", { jobId });

    expect(data).toMatchObject({ finished: false, queries: { asked: 0, skipped: 0 } });
    expect(data).not.toHaveProperty("note");
  });
});

describe("istruzioni e descrizioni sulla ricerca", () => {
  // covers: AC-8302-3
  it("initialize consiglia al massimo 5 parole di partenza per argomento con create_topic e run_search dice che toglie le keyword non ritrovate", async () => {
    const root = await rootAdminWithKey("t8302-instructions");

    const init = await rpc(root.key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2.0.0" } });
    const list = await rpc(root.key, "tools/list", {}, 2);

    const instructions = String(init.result?.instructions);
    const rule = instructions.split("\n").find((line) => line.includes("at most 5 seed keywords"));
    expect(rule).toBeDefined();
    expect(rule).toContain("create_topic");
    expect(rule).toContain("45");
    const tools = list.result?.tools as { name: string; description: string }[];
    const runSearch = tools.find((tool) => tool.name === "run_search");
    expect(runSearch?.description).toContain("removes the keywords it does not find again");
    expect(runSearch?.description).toContain("limited number of queries");
    expect(tools.find((tool) => tool.name === "create_topic")?.description).toContain("limited number of queries");
    expect(tools.find((tool) => tool.name === "create_project")?.description).toContain("limited number of queries");
    expect(tools.map((tool) => tool.name).indexOf("create_topic")).toBe(tools.map((tool) => tool.name).indexOf("run_search") + 1);
  });
});
