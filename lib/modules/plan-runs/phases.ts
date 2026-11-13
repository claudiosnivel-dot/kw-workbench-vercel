import type { Prisma } from "@/lib/generated/prisma/client";
import { ProjectNotFoundError } from "@/lib/modules/project-access";
import { collectSerps, type PlanDataContext, requestSerps } from "@/lib/modules/plan-data/serps";
import { fillPerimeterVolumes } from "@/lib/modules/plan-data/volumes";
import type { PlanNotice, PlanRunPhase } from "@/lib/modules/plan-runs/types";
import type { MetricsProviderError } from "@/lib/modules/providers/metrics/types";
import type { SerpTask } from "@/lib/modules/providers/serp/dataforseo-serp";
import {
  draftStrategy,
  type GenerateRequest,
  resolveStrategyTarget,
  saveStrategyDraft,
  type StrategyDraft,
  topPerimeterKeywords,
} from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";

/*
 * Fasi del lavoro di piano (T-6201, D-57): volumi delle keyword tenute senza volume (T-6102), risultati di Google delle
 * prime 1000 keyword (T-6101, invio e raccolta), raggruppamento con il motore di oggi (buildStrategyPlan, T-1901) e
 * salvataggio di generateStrategy (T-1903). Ogni dato mancato lascia il motivo in notice e il lavoro continua: il piano
 * esce sempre, con grouping_notice. Il modulo 63 cambia solo la fase cluster.
 */

/** Keyword del perimetro, per priorità, che ricevono i risultati di Google. */
export const SERP_KEYWORD_LIMIT = 1000;
/** Raccolta dei risultati: un nuovo tentativo ogni 10 s finché i task sono pronti o passano 10 minuti dall'invio. */
export const SERP_COLLECT_INTERVAL_MS = 10_000;
export const SERP_COLLECT_TIMEOUT_MS = 600_000;

/** Richiesta salvata all'avvio (GenerateRequest della POST /strategies) con il nome già scelto. */
export type PlanRunRequest = GenerateRequest & { name: string };

/** Task dei risultati di Google in attesa, con lingua e paese della richiesta e l'istante dell'invio. */
type SerpsCursor = { tasks: SerpTask[]; postedAt: string; languageCode: string; countryCode: string };

export const PLAN_RUN_SELECT = {
  id: true,
  project_id: true,
  workspace_id: true,
  requested_by: true,
  request: true,
  status: true,
  phase: true,
  cursor: true,
  progress_done: true,
  progress_total: true,
  locked_until: true,
  notice: true,
  requester: { select: { is_root_admin: true } },
} satisfies Prisma.PlanRunSelect;

export type PlanRunRecord = Prisma.PlanRunGetPayload<{ select: typeof PLAN_RUN_SELECT }>;

/** Lease del passo in corso: ogni scrittura del lavoro la richiede, così un passo che l'ha persa non scrive. */
export type PlanRunLease = { runId: string; lockedUntil: Date };

/** Il passo non ha più la lease del lavoro: un altro passo l'ha ripreso. */
export class PlanRunLeaseLostError extends Error {
  constructor() {
    super("Lease del lavoro di piano persa");
    this.name = "PlanRunLeaseLostError";
  }
}

/** Quello che resta fra due fasi dello stesso passo: la strategia preparata dalla fase cluster per la fase save. */
export type PlanRunMemo = { draft?: StrategyDraft };

export type PlanPhaseContext = { run: PlanRunRecord; lease: PlanRunLease; memo: PlanRunMemo };

/** Esito di una fase: waitMs se la stessa fase va ripetuta dopo un'attesa (raccolta dei risultati non ancora pronti). */
export type PlanPhaseOutcome = { waitMs?: number } | undefined;

/** Scrive il lavoro solo se è ancora running con la lease di questo passo, con heartbeat_at adesso. */
export async function writePlanRun(
  client: Prisma.TransactionClient,
  lease: PlanRunLease,
  data: Prisma.PlanRunUncheckedUpdateManyInput
): Promise<void> {
  const written = await client.planRun.updateMany({
    where: { id: lease.runId, locked_until: lease.lockedUntil, status: "running" },
    data: { ...data, heartbeat_at: new Date() },
  });
  if (written.count !== 1) throw new PlanRunLeaseLostError();
}

const requestOf = (run: PlanRunRecord) => run.request as unknown as PlanRunRequest;

/** Chi ha avviato il lavoro: le sue autorizzazioni valgono per tutto il lavoro; senza autore (utente eliminato) 404. */
function requesterOf(run: PlanRunRecord): { id: string } {
  if (!run.requested_by) throw new ProjectNotFoundError();
  return { id: run.requested_by };
}

const actorOf = (run: PlanRunRecord) => ({ isRootAdmin: run.requester?.is_root_admin ?? false });

/** Il primo motivo resta: il piano dice perché è mancato il primo dato. */
const firstNotice = (run: PlanRunRecord, notice: PlanNotice | undefined) => run.notice ?? notice ?? null;

const noticeOf = (outcome: { notice?: PlanNotice; providerError?: MetricsProviderError }): PlanNotice | undefined =>
  outcome.notice ?? (outcome.providerError ? "PROVIDER_ERROR" : undefined);

async function volumesPhase({ run, lease }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  const filled = await fillPerimeterVolumes({ id: run.project_id, workspace_id: run.workspace_id }, requestOf(run).settings, {
    actor: actorOf(run),
    jobId: run.id,
  });
  await writePlanRun(prisma, lease, { phase: "serps_post", notice: firstNotice(run, noticeOf(filled)) });
  return undefined;
}

function serpsContext(run: PlanRunRecord, target: { languageCode: string; countryCode: string }): PlanDataContext {
  return { ...target, projectId: run.project_id, jobId: run.id, actor: actorOf(run), workspaceId: run.workspace_id };
}

/** Invia i task delle prime 1000 keyword senza risultati recenti; l'avanzamento conta le keyword già a posto. */
async function serpsPostPhase({ run, lease }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  const request = requestOf(run);
  const { language, country } = await resolveStrategyTarget(requesterOf(run), run.project_id, request);
  const keywords = await topPerimeterKeywords(run.project_id, request.settings, SERP_KEYWORD_LIMIT);
  const cursor: SerpsCursor = { tasks: [], postedAt: new Date().toISOString(), languageCode: language, countryCode: country };
  const posted = await requestSerps(
    keywords.map((keyword) => ({ displayKeyword: keyword.keyword, canonical: keyword.canonical })),
    serpsContext(run, cursor)
  );
  cursor.tasks = posted.tasks;
  await writePlanRun(prisma, lease, {
    phase: posted.tasks.length > 0 ? "serps_collect" : "cluster",
    cursor: { serps: cursor },
    notice: firstNotice(run, noticeOf(posted)),
    progress_total: keywords.length,
    progress_done: keywords.length - posted.tasks.length,
  });
  return undefined;
}

function serpsCursorOf(cursor: Prisma.JsonValue): SerpsCursor | null {
  const serps = (cursor as { serps?: SerpsCursor } | null)?.serps;
  return serps && Array.isArray(serps.tasks) ? serps : null;
}

/**
 * Raccoglie i task pronti: con tutti raccolti, senza credenziali o dopo 10 minuti dall'invio (SERP_TIMEOUT) passa al
 * raggruppamento; altrimenti chiede di ripetere la fase dopo SERP_COLLECT_INTERVAL_MS. Un task non riuscito lascia la sua
 * keyword senza risultati con PROVIDER_ERROR.
 */
async function serpsCollectPhase({ run, lease }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  const state = serpsCursorOf(run.cursor);
  const collected = state && state.tasks.length > 0 ? await collectSerps(state.tasks, serpsContext(run, state)) : null;
  const pending = collected && !collected.notice ? collected.pending : [];
  const expired = pending.length > 0 && state !== null && Date.now() - Date.parse(state.postedAt) >= SERP_COLLECT_TIMEOUT_MS;
  const waiting = pending.length > 0 && !expired;
  const failedNotice: PlanNotice | undefined = collected && collected.failed.length > 0 ? "PROVIDER_ERROR" : undefined;
  await writePlanRun(prisma, lease, {
    phase: waiting ? "serps_collect" : "cluster",
    cursor: state ? { serps: { ...state, tasks: waiting ? pending : [] } } : {},
    notice: firstNotice(run, collected?.notice ?? failedNotice ?? (expired ? "SERP_TIMEOUT" : undefined)),
    progress_done: waiting ? run.progress_total - pending.length : run.progress_total,
  });
  return waiting ? { waitMs: SERP_COLLECT_INTERVAL_MS } : undefined;
}

/** Raggruppa il perimetro con il motore di oggi e prepara la strategia; la fase save la salva nello stesso passo. */
async function clusterPhase({ run, lease, memo }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  const request = requestOf(run);
  memo.draft = await draftStrategy(requesterOf(run), run.project_id, request, request.name);
  await writePlanRun(prisma, lease, { phase: "save" });
  return undefined;
}

/**
 * Salva la strategia con la fonte del raggruppamento (ENGINE fino al modulo 63) e il motivo, e nella stessa transazione
 * chiude il lavoro a completed con strategy_id: un passo che ha perso la lease non salva nulla.
 */
async function savePhase({ run, lease, memo }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  const request = requestOf(run);
  const draft = memo.draft ?? (await draftStrategy(requesterOf(run), run.project_id, request, request.name));
  await saveStrategyDraft(draft, { source: "ENGINE", notice: run.notice }, (tx, strategyId) =>
    writePlanRun(tx, lease, { status: "completed", phase: "done", strategy_id: strategyId, locked_until: null, progress_done: run.progress_total })
  );
  memo.draft = undefined;
  return undefined;
}

/** Fase per nome, nell'ordine di PLAN_RUN_PHASES. */
export const PLAN_PHASES: Record<Exclude<PlanRunPhase, "done">, (context: PlanPhaseContext) => Promise<PlanPhaseOutcome>> = {
  volumes: volumesPhase,
  serps_post: serpsPostPhase,
  serps_collect: serpsCollectPhase,
  cluster: clusterPhase,
  save: savePhase,
};
