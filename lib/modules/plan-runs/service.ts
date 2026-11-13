import { requireProjectAccess } from "@/lib/authz/workspace";
import { Prisma } from "@/lib/generated/prisma/client";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import type { PlanRunRequest } from "@/lib/modules/plan-runs/phases";
import { reapStalePlanRuns } from "@/lib/modules/plan-runs/run";
import type { PlanRunPhase, PlanRunView } from "@/lib/modules/plan-runs/types";
import { checkStrategyStart, type GenerateRequest } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";

/*
 * Avvio e lettura dei lavori di piano (T-6201, T-6202): la POST /strategies crea il lavoro dopo i controlli di oggi e
 * risponde 202 con runId; la pagina del piano legge lo stato del lavoro, che riprende se è fermo.
 */

/** 409 con l'id del lavoro già attivo nel progetto: il client segue quello (CWE-770). */
const activePlanRunError = (runId: string | undefined) =>
  new AppError(409, JOB_ERROR_CODES.alreadyActive, "C'è già un piano in preparazione per questo progetto", runId ? { runId } : undefined);

/** Lavoro inesistente o di un altro progetto: stessa risposta (CWE-639). */
class PlanRunNotFoundError extends AppError {
  constructor() {
    super(404, "PLAN_RUN_NOT_FOUND", "Lavoro di piano non trovato");
    this.name = "PlanRunNotFoundError";
  }
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function activeRunIdOf(projectId: string): Promise<string | undefined> {
  const run = await prisma.planRun.findFirst({ where: { project_id: projectId, status: { in: ACTIVE_JOB_STATUSES } }, select: { id: true } });
  return run?.id;
}

/**
 * Avvia il lavoro di piano (T-6201): permessi, limite di 20 strategie, sezione e perimetro non vuoto come la
 * generazione di oggi (T-1903); con un lavoro attivo nel progetto 409 JOB_ALREADY_ACTIVE con il suo runId, anche per due
 * avvii insieme (indice unico parziale, CWE-362). Il lavoro salva la richiesta con il nome già scelto e il primo passo
 * parte con la continuazione firmata.
 */
export async function startPlanRun(user: { id: string }, projectId: string, request: GenerateRequest, defaultName: string): Promise<string> {
  const { project } = await checkStrategyStart(user, projectId, request);
  const active = await activeRunIdOf(project.id);
  if (active) throw activePlanRunError(active);

  const saved: PlanRunRequest = { ...request, name: request.name ?? defaultName };
  let runId: string;
  try {
    const run = await prisma.planRun.create({
      data: { project_id: project.id, workspace_id: project.workspace_id, requested_by: user.id, request: saved as unknown as Prisma.InputJsonObject },
      select: { id: true },
    });
    runId = run.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw activePlanRunError(await activeRunIdOf(project.id));
  }
  schedulePlanRunContinuation(runId);
  return runId;
}

const VIEW_SELECT = {
  id: true,
  status: true,
  phase: true,
  progress_done: true,
  progress_total: true,
  strategy_id: true,
  error_code: true,
} satisfies Prisma.PlanRunSelect;

function toView(run: Prisma.PlanRunGetPayload<{ select: typeof VIEW_SELECT }>): PlanRunView {
  return {
    id: run.id,
    status: run.status,
    phase: run.phase as PlanRunPhase,
    progress: { done: run.progress_done, total: run.progress_total },
    strategyId: run.strategy_id,
    errorCode: run.error_code,
  };
}

/** Stato del lavoro dopo la ripresa, se era fermo (T-6202): la lettura è anche il recupero dei lavori interrotti. */
async function viewAfterReap(projectId: string, runId: string): Promise<PlanRunView> {
  await reapStalePlanRuns({ runId });
  return toView(await prisma.planRun.findFirstOrThrow({ where: { id: runId, project_id: projectId }, select: VIEW_SELECT }));
}

/**
 * Stato di un lavoro di piano per chi ha project.read sul progetto (T-6202): project_id nel where, quindi il lavoro di un
 * altro progetto è 404 PLAN_RUN_NOT_FOUND (CWE-639). Un lavoro fermo riparte, come i job al polling (T-1203).
 */
export async function readPlanRunStatus(user: { id: string }, projectId: string, runId: string): Promise<PlanRunView> {
  const project = await requireProjectAccess(user, projectId, "project.read", {});
  const run = await prisma.planRun.findFirst({ where: { id: runId, project_id: project.id }, select: { id: true } });
  if (!run) throw new PlanRunNotFoundError();
  return viewAfterReap(project.id, run.id);
}

/** Lavoro attivo di un progetto già autorizzato, o null (T-6202): la pagina del piano ne mostra l'avanzamento. */
export async function readActivePlanRun(projectId: string): Promise<PlanRunView | null> {
  const runId = await activeRunIdOf(projectId);
  return runId ? viewAfterReap(projectId, runId) : null;
}

/** Lavoro attivo del progetto per chi ha project.read (GET .../plan-runs/active, T-6202). */
export async function readActivePlanRunFor(user: { id: string }, projectId: string): Promise<PlanRunView | null> {
  const project = await requireProjectAccess(user, projectId, "project.read", {});
  return readActivePlanRun(project.id);
}
