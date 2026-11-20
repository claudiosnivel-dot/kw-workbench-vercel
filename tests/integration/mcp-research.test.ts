// Gate di T-7301 (AC-7301-1…4): Claude Code crea il progetto con lingua e paese scelti da lui, lancia la ricerca e la
// aspetta con wait_for_job, che rilegge lo stato ogni 3 s per al massimo 50 s; un solo lavoro attivo per argomento.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { waitClock } from "@/lib/modules/agent/wait";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { runJobById } from "@/lib/modules/jobs/job-runner";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey } from "../helpers/mcp";

// La ricerca non parte in background: i test la fanno avanzare quando serve (runJobById).
vi.mock("@/lib/modules/jobs/continuation", () => ({ scheduleJobContinuation: vi.fn() }));

// Fornitori simulati: un suggerimento per query, nessun volume.
vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({
    id: "MOCK",
    suggest: async ({ query }: { query: string }) => [{ keyword: `${query} prezzi`, source: "mock-autocomplete", sourceQuery: query }],
  }),
}));

type Started = { projectId: string; topicId: string; jobId: string | null; extraction: string; spend: { spentTodayUsd: number; capUsd: number } };
type Waited = {
  jobId: string;
  status: string;
  phase: string;
  finished: boolean;
  progress: { keywordsFound: number; volumesRequested: number };
  keptKeywords?: number;
};

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.mocked(scheduleJobContinuation).mockClear();
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Orologio dell'attesa senza attese vere: ogni sleep sposta il tempo e, se serve, fa un passo del lavoro. */
function virtualClock(onSleep: (count: number) => Promise<void> = async () => {}) {
  const clock = { elapsed: 0, sleeps: 0 };
  vi.spyOn(waitClock, "now").mockImplementation(() => clock.elapsed);
  vi.spyOn(waitClock, "sleep").mockImplementation(async (ms) => {
    clock.elapsed += ms;
    clock.sleeps += 1;
    await onSleep(clock.sleeps);
  });
  return clock;
}

/** Progetto del root admin con i fornitori simulati e poche query, un argomento per ricerca e una parola di partenza. */
async function searchableProject(workspaceId: string, topics: string[]) {
  const project = await prisma.project.create({
    data: {
      name: "Noleggio magnetoterapia",
      workspace_id: workspaceId,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: "NONE",
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  const ids: string[] = [];
  for (const [position, name] of topics.entries()) {
    const topic = await prisma.subproject.create({ data: { project_id: project.id, name, position } });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: topic.id, keyword: name.toLowerCase() } });
    ids.push(topic.id);
  }
  return { projectId: project.id, topicIds: ids };
}

describe("create_project del server MCP", () => {
  // covers: AC-7301-1
  it("crea progetto it/IT nel workspace personale, l'argomento con la parola di partenza e una ricerca con origin AGENT", async () => {
    const root = await rootAdminWithKey("t7301-root");

    const { result, data } = await callTool(root.key, "create_project", {
      name: "Noleggio magnetoterapia",
      languageCode: "it",
      countryCode: "IT",
      seeds: ["noleggio magnetoterapia"],
    });

    expect(result?.isError).not.toBe(true);
    const started = data as unknown as Started;
    expect(started).toMatchObject({ extraction: "started", spend: { spentTodayUsd: 0, capUsd: 2 } });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: started.projectId } });
    expect(project).toMatchObject({
      name: "Noleggio magnetoterapia",
      workspace_id: root.workspaceId,
      language_code: "it",
      country_code: "IT",
      default_subproject_id: started.topicId,
    });
    const seeds = await prisma.seed.findMany({ where: { subproject_id: started.topicId }, select: { keyword: true } });
    expect(seeds).toEqual([{ keyword: "noleggio magnetoterapia" }]);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: started.jobId as string } });
    expect(job).toMatchObject({ project_id: started.projectId, subproject_id: started.topicId, origin: "AGENT", status: "pending" });
    expect(scheduleJobContinuation).toHaveBeenCalledWith(started.jobId);
    const call = await prisma.agentCall.findFirstOrThrow({ where: { tool: "create_project" } });
    expect(call).toMatchObject({ ok: true, project_id: started.projectId });
  });

  // covers: AC-7301-2
  it("una lingua non supportata o 11 parole di partenza sono VALIDATION_ERROR e non creano progetti", async () => {
    const root = await rootAdminWithKey("t7301-invalid");
    const base = { name: "Sito", languageCode: "it", countryCode: "IT", seeds: ["scarpe running"] };

    const language = await callTool(root.key, "create_project", { ...base, languageCode: "xx" });
    const tooMany = await callTool(root.key, "create_project", {
      ...base,
      seeds: Array.from({ length: 11 }, (_, index) => `parola ${index}`),
    });

    for (const reply of [language, tooMany]) {
      expect(reply.result?.isError).toBe(true);
      expect(reply.data).toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(language.data).toMatchObject({ field: "languageCode" });
    expect(tooMany.data).toMatchObject({ field: "seeds" });
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
  });

  it("crea nel workspace indicato fra i suoi; un workspace di cui non è membro è WORKSPACE_NOT_FOUND", async () => {
    const root = await rootAdminWithKey("t7301-workspace");
    const other = await createUserWithSession({ displayName: "t7301-altro" });
    const team = await prisma.workspace.create({ data: { name: "Squadra", slug: "t7301-squadra" } });
    await prisma.membership.create({ data: { workspace_id: team.id, user_id: root.user.id, role: "OWNER" } });
    const input = { name: "Sito della squadra", languageCode: "en", countryCode: "GB", seeds: ["running shoes", " Running  Shoes "] };

    const inTeam = await callTool(root.key, "create_project", { ...input, workspaceId: team.id });
    const foreign = await callTool(root.key, "create_project", { ...input, workspaceId: other.workspaceId });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: (inTeam.data as unknown as Started).projectId } });
    expect(project).toMatchObject({ workspace_id: team.id, language_code: "en", country_code: "GB" });
    expect(await prisma.seed.count({ where: { project_id: project.id } })).toBe(1);
    expect(foreign.data).toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    expect(await prisma.project.count({ where: { workspace_id: other.workspaceId } })).toBe(0);
  });
});

describe("wait_for_job e run_search del server MCP", () => {
  // covers: AC-7301-3
  it("risponde appena la ricerca finisce con le keyword tenute; una ricerca che non finisce risponde dopo 50 s con la fase", async () => {
    const root = await rootAdminWithKey("t7301-wait");
    const { projectId, topicIds } = await searchableProject(root.workspaceId, ["Noleggio magnetoterapia", "Magnetoterapia prezzi"]);
    const first = await callTool(root.key, "run_search", { projectId, topicId: topicIds[0] });
    const jobId = (first.data as { jobId: string }).jobId;

    // La ricerca finisce durante la seconda attesa: wait_for_job la vede alla lettura dopo.
    const quick = virtualClock(async (count) => {
      if (count === 2) {
        await runJobById(jobId);
      }
    });
    const finished = await callTool(root.key, "wait_for_job", { jobId });

    const kept = await prisma.keywordCandidate.count({ where: { subproject_id: topicIds[0], ...KEPT_WHERE } });
    expect(kept).toBeGreaterThan(0);
    expect(finished.data as unknown as Waited).toMatchObject({ jobId, status: "completed", phase: "done", finished: true, keptKeywords: kept });
    expect(quick.elapsed).toBe(6_000);
    vi.restoreAllMocks();

    // Una ricerca che resta in corso: la risposta arriva allo scadere dei 50 s, con lo stato e la fase.
    const second = await callTool(root.key, "run_search", { projectId, topicId: topicIds[1] });
    const runningId = (second.data as { jobId: string }).jobId;
    await prisma.job.update({ where: { id: runningId }, data: { status: "running", phase: "autocomplete", started_at: new Date(), heartbeat_at: new Date() } });
    const slow = virtualClock();
    const pending = await callTool(root.key, "wait_for_job", { jobId: runningId });

    expect(pending.data as unknown as Waited).toMatchObject({ jobId: runningId, status: "running", phase: "autocomplete", finished: false });
    expect(pending.data).not.toHaveProperty("keptKeywords");
    expect(slow.elapsed).toBe(50_000);
    expect(slow.sleeps).toBe(17);
  });

  // covers: AC-7301-4
  it("con una ricerca già attiva sull'argomento run_search è JOB_ALREADY_ACTIVE con il jobId e non nasce un secondo lavoro", async () => {
    const root = await rootAdminWithKey("t7301-active");
    const { projectId } = await searchableProject(root.workspaceId, ["Noleggio magnetoterapia"]);
    const first = await callTool(root.key, "run_search", { projectId });
    const activeId = (first.data as { jobId: string }).jobId;

    const second = await callTool(root.key, "run_search", { projectId, seeds: ["magnetoterapia costo"] });

    expect(second.result?.isError).toBe(true);
    expect(second.data).toMatchObject({ code: "JOB_ALREADY_ACTIVE", jobId: activeId });
    expect(await prisma.job.count({ where: { project_id: projectId } })).toBe(1);
    expect(await prisma.seed.count({ where: { project_id: projectId } })).toBe(1);
  });

  it("run_search aggiunge solo le parole di partenza nuove al primo argomento e avvia la ricerca con origin AGENT", async () => {
    const root = await rootAdminWithKey("t7301-seeds");
    const { projectId, topicIds } = await searchableProject(root.workspaceId, ["Noleggio magnetoterapia", "Altro"]);

    const { data } = await callTool(root.key, "run_search", { projectId, seeds: ["NOLEGGIO magnetoterapia", "magnetoterapia a casa"] });

    expect(data).toMatchObject({ topicId: topicIds[0], addedSeeds: 1, spend: { spentTodayUsd: 0, capUsd: 2 } });
    const seeds = await prisma.seed.findMany({ where: { subproject_id: topicIds[0] }, orderBy: { created_at: "asc" }, select: { keyword: true } });
    expect(seeds.map((seed) => seed.keyword)).toEqual(["noleggio magnetoterapia", "magnetoterapia a casa"]);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: (data as { jobId: string }).jobId } });
    expect(job).toMatchObject({ subproject_id: topicIds[0], origin: "AGENT" });
  });

  it("la ricerca di un progetto di un altro workspace è JOB_NOT_FOUND per wait_for_job e PROJECT_NOT_FOUND per run_search", async () => {
    const root = await rootAdminWithKey("t7301-foreign");
    const owner = await createUserWithSession({ displayName: "t7301-proprietario" });
    const { projectId, topicIds } = await searchableProject(owner.workspaceId, ["Calze"]);
    const job = await prisma.job.create({ data: { project_id: projectId, subproject_id: topicIds[0] } });

    const waited = await callTool(root.key, "wait_for_job", { jobId: job.id });
    const started = await callTool(root.key, "run_search", { projectId });

    expect(waited.data).toMatchObject({ code: "JOB_NOT_FOUND" });
    expect(started.data).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(await prisma.job.count()).toBe(1);
  });
});
