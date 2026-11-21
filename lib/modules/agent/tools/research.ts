import { z } from "zod";
import type { AuthUser } from "@/lib/auth/credentials";
import { requireVerifiedEmail } from "@/lib/auth/verified-email";
import { type AuthorizedProject, getCurrentWorkspace, projectAccessWhere, requireProjectAccess, requireWorkspaceRole } from "@/lib/authz/workspace";
import { assertWithinLimit, loadPlanGuard } from "@/lib/billing/enforce";
import { isSupportedCountryCode, isSupportedLanguageCode, normalizeCountryCode, normalizeLanguageCode } from "@/lib/constants/locale-options";
import type { Job } from "@/lib/generated/prisma/client";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { assertAgentSpendAllowed, readAgentSpend } from "@/lib/modules/agent/spend";
import { type AgentToolContext, defineTool } from "@/lib/modules/agent/tool";
import { waitForPlanRun } from "@/lib/modules/agent/tools/plan";
import { pollUntilFinished } from "@/lib/modules/agent/wait";
import { scheduleJobContinuation } from "@/lib/modules/jobs/continuation";
import { findActiveJobId } from "@/lib/modules/jobs/job-api";
import { startExtractionJob } from "@/lib/modules/jobs/job-runner";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { reapStaleJobs } from "@/lib/modules/jobs/reaper";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { SectionNotFoundError } from "@/lib/modules/project-access";
import { NAME_MAX_LENGTH, SEED_MAX_LENGTH } from "@/lib/modules/project-settings";
import { createQuickStartProject, startQuickStartExtraction } from "@/lib/modules/quick-start";
import { uniqueSeeds } from "@/lib/modules/quick-start-topics";
import { prisma } from "@/lib/prisma";

// Strumenti della ricerca del server MCP (T-7301, D-64): Claude Code crea il progetto, lancia la ricerca e la aspetta,
// con i permessi dell'app (project.create, extraction.run, project.read) e il tetto giornaliero della sua spesa (T-7302)
// controllato prima di ogni avvio. I lavori che avvia hanno origin AGENT.

/** Parole di partenza per chiamata: da 1 a 10 (scelta dell'agente nel modulo 73). */
const MAX_AGENT_SEEDS = 10;

const idField = (description: string) => z.string().min(1).max(64).describe(description);

const seedsField = z
  .array(z.string().max(SEED_MAX_LENGTH))
  .min(1)
  .max(MAX_AGENT_SEEDS)
  .describe(`Seed keywords taken from the site, 1 to ${MAX_AGENT_SEEDS}, each up to ${SEED_MAX_LENGTH} characters`);

/** Parole di partenza ripulite (spazi, vuote, doppioni): nessuna rimasta è un VALIDATION_ERROR sul campo seeds. */
function cleanSeeds(values: readonly string[]): string[] {
  const seeds = uniqueSeeds(values);
  if (seeds.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Nessuna parola di partenza", { field: "seeds" });
  }
  return seeds;
}

/** Workspace indicato o, senza, quello personale dell'utente, con il permesso project.create (404 se non è membro). */
async function targetWorkspace(user: AuthUser, workspaceId: string | undefined) {
  return requireWorkspaceRole(user, workspaceId ?? (await getCurrentWorkspace(user, null)).workspace.id, "project.create");
}

export const createProjectTool = defineTool({
  name: "create_project",
  description:
    "Create a project with its first topic and seed keywords, in the language and country you choose, and start the keyword research of that topic. Answers with projectId, topicId and jobId (null with the code that prevented the start, the project stays created) and today's spending against the daily cap. Wait for the research with wait_for_job.",
  input: z
    .object({
      name: z.string().min(1).max(NAME_MAX_LENGTH).describe("Project name, usually the site or business name"),
      languageCode: z.string().refine(isSupportedLanguageCode, "unsupported language").describe("Search language, ISO 639-1 code such as it, en or es"),
      countryCode: z.string().refine(isSupportedCountryCode, "unsupported country").describe("Search country, ISO 3166-1 alpha-2 code such as IT, US or ES"),
      seeds: seedsField,
      workspaceId: idField("Workspace id from list_projects; the user's personal workspace when omitted").optional(),
    })
    .strict(),
  async run(input, { user, recordProject }) {
    const seeds = cleanSeeds(input.seeds);
    const workspace = await targetWorkspace(user, input.workspaceId);
    const spend = await assertAgentSpendAllowed();
    const targeting = { languageCode: normalizeLanguageCode(input.languageCode), countryCode: normalizeCountryCode(input.countryCode) };

    const creation = await createQuickStartProject(user, workspace.id, { name: input.name.trim(), seeds, ...targeting }, targeting);
    recordProject(creation.projectId);
    const { jobId, extraction } = await startQuickStartExtraction(user, creation, workspace, "AGENT");
    return { ...creation, jobId, extraction, spend };
  },
});

/**
 * Aggiunge all'argomento le parole di partenza che non ha già (senza distinzione di maiuscole), con il limite
 * maxSeedsPerSection del piano come la modifica della sezione (T-1605); restituisce quante ne ha aggiunte.
 */
async function addTopicSeeds(project: AuthorizedProject, topicId: string, seeds: string[]): Promise<number> {
  const plan = await loadPlanGuard(project.workspace_id);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.seed.findMany({ where: { project_id: project.id, subproject_id: topicId }, select: { keyword: true } });
    const known = new Set(existing.map((seed) => seed.keyword.toLowerCase()));
    const added = seeds.filter((seed) => !known.has(seed.toLowerCase()));
    if (added.length === 0) {
      return 0;
    }
    await assertWithinLimit(tx, plan, "maxSeedsPerSection", () => existing.length + added.length, () => existing.length);
    await tx.seed.createMany({ data: added.map((keyword) => ({ project_id: project.id, subproject_id: topicId, keyword })) });
    await touchProjectActivity(tx, project);
    return added.length;
  });
}

function alreadyActive(jobId: string): AppError {
  return new AppError(409, JOB_ERROR_CODES.alreadyActive, "Un'estrazione è già in corso per questa sezione", { jobId });
}

export const runSearchTool = defineTool({
  name: "run_search",
  description:
    "Start the keyword research of a topic again, after adding the new seed keywords you pass (the first topic of the project when topicId is omitted). One research at a time per topic: JOB_ALREADY_ACTIVE gives the jobId of the running one. Answers with jobId and today's spending against the daily cap. Wait for it with wait_for_job.",
  input: z
    .object({
      projectId: idField("Project id from list_projects or create_project"),
      topicId: idField("Topic id from get_project; the first topic when omitted").optional(),
      seeds: seedsField.optional(),
    })
    .strict(),
  async run(input, { user, recordProject }) {
    requireVerifiedEmail(user);
    const project = await requireProjectAccess(user, input.projectId, "extraction.run", {
      subprojects: { orderBy: [{ position: "asc" }, { created_at: "asc" }], select: { id: true } },
    });
    recordProject(project.id);
    if (project.subprojects.length === 0) {
      throw new AppError(400, "NO_SECTIONS", "Nessuna sezione disponibile. Crea prima una sezione.");
    }
    const topicId = input.topicId ?? project.subprojects[0].id;
    if (!project.subprojects.some((topic) => topic.id === topicId)) {
      throw new SectionNotFoundError();
    }
    const active = await findActiveJobId(topicId);
    if (active) {
      throw alreadyActive(active);
    }
    const seeds = input.seeds ? cleanSeeds(input.seeds) : [];
    const spend = await assertAgentSpendAllowed();

    const addedSeeds = seeds.length > 0 ? await addTopicSeeds(project, topicId, seeds) : 0;
    const { job, created } = await startExtractionJob(project.id, topicId, project.workspace_id, user, "AGENT");
    if (!created) {
      throw alreadyActive(job.id);
    }
    scheduleJobContinuation(job.id);
    return { jobId: job.id, topicId, addedSeeds, spend };
  },
});

/** Lavoro inesistente o di un progetto non accessibile: stessa risposta (CWE-639). */
function jobNotFound(): AppError {
  return new AppError(404, JOB_ERROR_CODES.notFound, "Job non trovato");
}

/** Ricerca riletta dopo il recupero dei lavori bloccati (T-1203), come al polling dell'app; null se non c'è più. */
async function readJob(jobId: string): Promise<Job | null> {
  await reapStaleJobs({ jobId });
  return prisma.job.findUnique({ where: { id: jobId } });
}

/**
 * Avanzamento con le parole di Claude Code: keyword trovate (i suggerimenti raccolti finché la fase è autocomplete, poi
 * le keyword uniche) e volumi chiesti (le keyword già passate dalla fase metrics).
 */
async function searchProgress(job: Job) {
  const found =
    job.phase === "expand" ? 0 : job.phase === "autocomplete" ? await prisma.jobSuggestion.count({ where: { job_id: job.id } }) : job.progress_total;
  const volumes = job.phase === "metrics" ? job.progress_done : job.phase === "store" || job.phase === "done" ? job.progress_total : 0;
  return { done: job.progress_done, total: job.progress_total, keywordsFound: found, volumesRequested: volumes };
}

/** Attesa di una ricerca: quantità trovate e chieste e, a lavoro finito, le keyword tenute dell'argomento. */
async function waitForSearch(jobId: string, { user, recordProject }: AgentToolContext) {
  const owned = await prisma.job.findFirst({
    where: { id: jobId, project: projectAccessWhere(user.id, "project.read") },
    select: { id: true, project_id: true },
  });
  if (!owned) {
    throw jobNotFound();
  }
  recordProject(owned.project_id);

  const { value: job, finished } = await pollUntilFinished(
    async () => {
      const current = await readJob(jobId);
      if (!current) {
        throw jobNotFound();
      }
      return current;
    },
    (current) => !ACTIVE_JOB_STATUSES.includes(current.status)
  );
  const keptKeywords = finished ? await prisma.keywordCandidate.count({ where: { subproject_id: job.subproject_id, ...KEPT_WHERE } }) : undefined;
  return {
    jobId: job.id,
    topicId: job.subproject_id,
    status: job.status,
    phase: job.phase,
    finished,
    progress: await searchProgress(job),
    ...(keptKeywords === undefined ? {} : { keptKeywords }),
    ...(job.status === "failed" ? { error: job.error_message } : {}),
    spend: await readAgentSpend(),
  };
}

export const waitForJobTool = defineTool({
  name: "wait_for_job",
  description:
    "Wait for a keyword research (jobId from create_project or run_search) or a plan job (runId from build_plan): answers as soon as it is finished (completed, failed or canceled) or after about 50 seconds with its status, phase and progress. For a research the progress counts keywords found and volumes requested and, when finished, the kept keywords of the topic; for a plan job it counts the keywords with Google results and, when completed, gives the strategyId of the plan. Call it again while finished is false.",
  input: z
    .object({
      jobId: idField("Job id from create_project or run_search").optional(),
      runId: idField("Plan job id from build_plan").optional(),
    })
    .strict()
    .refine((input) => (input.jobId === undefined) !== (input.runId === undefined), "pass exactly one of jobId and runId"),
  async run({ jobId, runId }, context) {
    // Lavoro di piano con runId (T-7501), ricerca con jobId (T-7301).
    return runId ? waitForPlanRun(runId, context) : waitForSearch(jobId!, context);
  },
});
