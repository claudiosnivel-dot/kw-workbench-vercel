import { readModelCatalog } from "@/lib/ai/catalog";
import { countCountedRequests } from "@/lib/ai/requests";
import { getAiTitlesSettings, modelsForRequest } from "@/lib/ai/settings";
import { getOpenRouterSettings } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ProjectNotFoundError } from "@/lib/modules/project-access";
import { type AdviceAngle, type AdvicePage, ANGLE_ADVICE_BATCH_SIZE, adviseAngles } from "@/lib/modules/plan-ai/angle-advice";
import { CLASSIFY_BATCH_SIZE, type ClassifyContext, classifyKeywords, fixedClasses } from "@/lib/modules/plan-ai/classify";
import { collectSerps, type PlanDataContext, readFreshSerps, requestSerps } from "@/lib/modules/plan-data/serps";
import { fillPerimeterVolumes } from "@/lib/modules/plan-data/volumes";
import type { PlanNotice, PlanRunPhase } from "@/lib/modules/plan-runs/types";
import { logger } from "@/lib/observability/logger";
import type { MetricsProviderError } from "@/lib/modules/providers/metrics/types";
import type { SerpTask } from "@/lib/modules/providers/serp/dataforseo-serp";
import {
  draftStrategy,
  type GenerateRequest,
  resolveStrategyTarget,
  saveStrategyDraft,
  type StrategyDraft,
  type StrategyGrouping,
  topPerimeterKeywords,
} from "@/lib/modules/strategy/service";
import { buildSerpPlan } from "@/lib/modules/strategy/serp-cluster";
import type { KeywordClass, StrategyKeywordInput } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";

/*
 * Fasi del lavoro di piano (T-6201, D-57): volumi delle keyword tenute senza volume (T-6102), risultati di Google delle
 * prime 1000 keyword (T-6101, invio e raccolta), luoghi e concorrenti (T-6301), raggruppamento e salvataggio di
 * generateStrategy (T-1903). Il raggruppamento (T-6303) usa i risultati di Google (buildSerpPlan, T-6302) se ci sono per
 * almeno metà delle prime 1000 keyword, altrimenti il motore di oggi (buildStrategyPlan, T-1901) con SERP_TOO_FEW. Ogni
 * dato mancato lascia il motivo e il lavoro continua: il piano esce sempre, con grouping_notice. Con angoli da valutare
 * (T-6702) la fase advise chiede dopo il salvataggio il consiglio dell'AI (T-6901); senza consiglio il piano resta com'è.
 */

/** Keyword del perimetro, per priorità, che ricevono i risultati di Google. */
export const SERP_KEYWORD_LIMIT = 1000;
/** Raccolta dei risultati: un nuovo tentativo ogni 10 s finché i task sono pronti o passano 10 minuti dall'invio. */
export const SERP_COLLECT_INTERVAL_MS = 10_000;
export const SERP_COLLECT_TIMEOUT_MS = 600_000;
/** Il raggruppamento usa i risultati di Google se ci sono per almeno questa quota delle keyword che li hanno chiesti. */
export const SERP_MIN_SHARE = 0.5;
/**
 * Attesa massima di un modello e di una richiesta di classificazione con i modelli di riserva: 90 s e 180 s come gli
 * articoli (T-6501, prima 45 s e 100 s; il 2026-11-14 un modello grande rispondeva oltre i 45 s). Valgono anche per il
 * consiglio sugli angoli (T-6901).
 */
const CLASSIFY_ATTEMPT_TIMEOUT_MS = 90_000;
const CLASSIFY_DEADLINE_MS = 180_000;
/** Tempo lasciato al passo dopo la richiesta di classificazione, dentro la lease. */
const CLASSIFY_STEP_MARGIN_MS = 10_000;
/**
 * Tempo che una fase classify o advise vuole davanti quando non è la prima del passo: la richiesta intera più il margine,
 * così un gruppo non parte con un'attesa più corta (T-6501, T-6901); con meno il passo si ferma e il successivo riparte
 * da qui.
 */
export const CLASSIFY_PHASE_MS = CLASSIFY_DEADLINE_MS + CLASSIFY_STEP_MARGIN_MS;

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
  strategy_id: true,
  origin: true,
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
export type PlanRunMemo = { prepared?: { draft: StrategyDraft; grouping: StrategyGrouping } };

/** Contesto di una fase: lavoro, lease, memoria del passo e scadenza del passo (istante in ms epoch). */
export type PlanPhaseContext = { run: PlanRunRecord; lease: PlanRunLease; memo: PlanRunMemo; deadlineMs: number };

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

/** Lavoro avviato da Claude Code (T-7501): niente AI di Titan SEO, il ragionamento è suo. */
const byAgent = (run: PlanRunRecord) => run.origin === "AGENT";

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
    phase: posted.tasks.length > 0 ? "serps_collect" : "classify",
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
 * Raccoglie i task pronti: con tutti raccolti, senza credenziali o dopo 10 minuti dall'invio (SERP_TIMEOUT) passa ai
 * luoghi e concorrenti; altrimenti chiede di ripetere la fase dopo SERP_COLLECT_INTERVAL_MS. Un task non riuscito lascia la sua
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
    phase: waiting ? "serps_collect" : "classify",
    cursor: state ? { serps: { ...state, tasks: waiting ? pending : [] } } : {},
    notice: firstNotice(run, collected?.notice ?? failedNotice ?? (expired ? "SERP_TIMEOUT" : undefined)),
    progress_done: waiting ? run.progress_total - pending.length : run.progress_total,
  });
  return waiting ? { waitMs: SERP_COLLECT_INTERVAL_MS } : undefined;
}

/** Luoghi e concorrenti già riconosciuti (T-6301): keyword classificate fin qui, classi diverse da other e motivo dell'AI. */
type ClassifyCursor = { offset: number; place: string[]; competitor: string[]; notice: PlanNotice | null };

function classifyCursorOf(cursor: Prisma.JsonValue): ClassifyCursor | null {
  const classify = (cursor as { classify?: ClassifyCursor } | null)?.classify;
  return classify && typeof classify.offset === "number" && Array.isArray(classify.place) && Array.isArray(classify.competitor)
    ? classify
    : null;
}

const cursorObject = (cursor: Prisma.JsonValue) =>
  cursor && typeof cursor === "object" && !Array.isArray(cursor) ? (cursor as Prisma.JsonObject) : {};

/**
 * Keyword che hanno chiesto i risultati di Google (le prime 1000 del perimetro), i loro risultati salvati da meno di 30
 * giorni e se bastano al raggruppamento per risultati: almeno SERP_MIN_SHARE delle keyword con almeno un URL.
 */
async function serpInputs(run: PlanRunRecord) {
  const request = requestOf(run);
  const { language, country } = await resolveStrategyTarget(requesterOf(run), run.project_id, request);
  const keywords = await topPerimeterKeywords(run.project_id, request.settings, SERP_KEYWORD_LIMIT);
  const serps = await readFreshSerps(
    keywords.map((keyword) => keyword.canonical),
    { languageCode: language, countryCode: country }
  );
  const covered = keywords.filter((keyword) => (serps.get(keyword.canonical)?.length ?? 0) > 0).length;
  return { language, country, keywords, serps, useSerp: keywords.length > 0 && covered >= keywords.length * SERP_MIN_SHARE };
}

/**
 * Modello della classificazione e del consiglio sugli angoli (T-6901): off con AI_NOT_CONFIGURED se la funzione AI è
 * spenta o manca la chiave, con AI_CLASSIFY_UNAVAILABLE se il tetto della piattaforma (T-3901) è raggiunto per chi non è
 * root admin o se non c'è nessun modello utilizzabile (T-6403); altrimenti i modelli della card senza quelli assenti dal
 * catalogo, o i predefiniti ancora gratuiti, con il catalogo per i token dei modelli che ragionano (T-6401) e le righe di
 * ai_requests della funzione plan.
 */
async function planAi(run: PlanRunRecord, deadlineMs: number): Promise<ClassifyContext["ai"]> {
  const settings = await getAiTitlesSettings();
  const openRouter = getOpenRouterSettings();
  if (!settings.enabled || !openRouter) return { off: "AI_NOT_CONFIGURED" };
  const byRootAdmin = actorOf(run).isRootAdmin;
  if (!byRootAdmin && (await countCountedRequests()) >= settings.platformDailyRequests) return { off: "AI_CLASSIFY_UNAVAILABLE" };
  const catalog = await readModelCatalog();
  const models = modelsForRequest(settings, catalog);
  if (models.length === 0) return { off: "AI_CLASSIFY_UNAVAILABLE" };
  return {
    models,
    ...openRouter,
    deadlineMs: Math.max(1, Math.min(CLASSIFY_DEADLINE_MS, deadlineMs - Date.now() - CLASSIFY_STEP_MARGIN_MS)),
    attemptTimeoutMs: CLASSIFY_ATTEMPT_TIMEOUT_MS,
    catalog,
    record: { feature: "plan", workspaceId: run.workspace_id, byRootAdmin },
  };
}

/**
 * Classifica le keyword con risultati a gruppi di CLASSIFY_BATCH_SIZE, uno per volta (al più una richiesta al modello
 * con i suoi tentativi), e ripete la fase finché le ha viste tutte; con risultati per meno di metà delle keyword passa
 * subito al raggruppamento, che userà il motore di oggi, senza chiamare il modello. Un lavoro di Claude Code (T-7501)
 * passa subito al raggruppamento senza cursore: restano i soli riconoscimenti fissi (savedClasses).
 */
async function classifyPhase({ run, lease, deadlineMs }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  if (byAgent(run)) {
    await writePlanRun(prisma, lease, { phase: "cluster" });
    return undefined;
  }
  const inputs = await serpInputs(run);
  const state = classifyCursorOf(run.cursor) ?? { offset: 0, place: [], competitor: [], notice: null };
  if (!inputs.useSerp || state.offset >= inputs.keywords.length) {
    await writePlanRun(prisma, lease, { phase: "cluster" });
    return undefined;
  }
  const chunk = inputs.keywords.slice(state.offset, state.offset + CLASSIFY_BATCH_SIZE);
  const result = await classifyKeywords(chunk, inputs.serps, {
    language: inputs.language,
    country: inputs.country,
    ai: await planAi(run, deadlineMs),
  });
  const ofClass = (value: KeywordClass) => [...result.classes].filter(([, found]) => found === value).map(([canonical]) => canonical);
  const next: ClassifyCursor = {
    offset: state.offset + chunk.length,
    place: [...state.place, ...ofClass("place")],
    competitor: [...state.competitor, ...ofClass("competitor")],
    notice: state.notice ?? result.notice,
  };
  await writePlanRun(prisma, lease, {
    phase: next.offset >= inputs.keywords.length ? "cluster" : "classify",
    cursor: { ...cursorObject(run.cursor), classify: next },
  });
  return undefined;
}

/** Classi salvate dalla fase classify; senza (lavoro ripreso da una fase successiva) i soli riconoscimenti fissi. */
function savedClasses(run: PlanRunRecord, keywords: StrategyKeywordInput[], serps: Map<string, string[]>, language: string) {
  const state = classifyCursorOf(run.cursor);
  if (!state) return fixedClasses(keywords, serps, language);
  const classes = new Map<string, KeywordClass>();
  for (const canonical of state.place) classes.set(canonical, "place");
  for (const canonical of state.competitor) classes.set(canonical, "competitor");
  return classes;
}

/**
 * Strategia da salvare con la fonte del raggruppamento (T-6303): con i risultati di Google buildSerpPlan, grouping_source
 * SERP e come motivo il primo dato mancato o quello dell'AI, che per un lavoro di Claude Code è AGENT_PLAN (T-7501);
 * altrimenti il motore di oggi, ENGINE e il primo dato mancato o SERP_TOO_FEW.
 */
async function prepareDraft(run: PlanRunRecord): Promise<{ draft: StrategyDraft; grouping: StrategyGrouping }> {
  const request = requestOf(run);
  const user = requesterOf(run);
  const inputs = await serpInputs(run);
  if (!inputs.useSerp) {
    const draft = await draftStrategy(user, run.project_id, request, request.name);
    return { draft, grouping: { source: "ENGINE", notice: run.notice ?? "SERP_TOO_FEW" } };
  }
  const classes = savedClasses(run, inputs.keywords, inputs.serps, inputs.language);
  // T-6702 (D-62): angoli solo con i luoghi riconosciuti dall'AI in ogni gruppo; con i soli riconoscimenti fissi le città
  // diventerebbero angoli. Il cursore tiene il primo motivo dei gruppi: basta un gruppo non riuscito per non averne. Un
  // lavoro di Claude Code (T-7501) non classifica con l'AI, quindi non ne ha: gli angoli li valuta lui.
  const aiClassified = !byAgent(run) && classifyCursorOf(run.cursor)?.notice === null;
  const draft = await draftStrategy(user, run.project_id, request, request.name, (input) => {
    const plan = buildSerpPlan({ ...input, serps: inputs.serps, classes });
    return aiClassified ? plan : { ...plan, angles: [] };
  });
  const aiNotice: PlanNotice | null = byAgent(run) ? "AGENT_PLAN" : (classifyCursorOf(run.cursor)?.notice ?? null);
  return { draft, grouping: { source: "SERP", notice: run.notice ?? aiNotice } };
}

/** Raggruppa il perimetro e prepara la strategia; la fase save la salva nello stesso passo. */
async function clusterPhase({ run, lease, memo }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  memo.prepared = await prepareDraft(run);
  await writePlanRun(prisma, lease, { phase: "save" });
  return undefined;
}

/** Chiusura del lavoro a completed: la strategia è già salvata. */
const COMPLETED = { status: "completed", phase: "done", locked_until: null } satisfies Prisma.PlanRunUncheckedUpdateManyInput;

/**
 * Salva la strategia con la fonte del raggruppamento e il motivo, e nella stessa transazione scrive strategy_id nel
 * lavoro: un passo che ha perso la lease non salva nulla. Con angoli da valutare il lavoro passa alla fase advise
 * (T-6901), altrimenti si chiude a completed; un lavoro di Claude Code (T-7501) non ha la fase advise.
 */
async function savePhase({ run, lease, memo }: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  const { draft, grouping } = memo.prepared ?? (await prepareDraft(run));
  const advise = !byAgent(run) && draft.keywordRows.some((row) => row.angle);
  await saveStrategyDraft(draft, grouping, (tx, strategyId) =>
    writePlanRun(tx, lease, { ...(advise ? { phase: "advise" } : COMPLETED), strategy_id: strategyId, progress_done: run.progress_total })
  );
  memo.prepared = undefined;
  return undefined;
}

/** Angoli della strategia salvata già mandati al modello (T-6901). */
type AdviseCursor = { offset: number };

function adviseCursorOf(cursor: Prisma.JsonValue): AdviseCursor | null {
  const advise = (cursor as { advise?: AdviseCursor } | null)?.advise;
  return advise && typeof advise.offset === "number" ? advise : null;
}

/**
 * Pagine della strategia salvata nell'ordine di lavoro, con la keyword principale, e angoli da valutare in un ordine
 * fisso (volume, poi forma canonica), così i lotti di passi diversi non si sovrappongono.
 */
async function adviceInputs(strategyId: string): Promise<{ pages: AdvicePage[]; angles: AdviceAngle[] }> {
  const [pages, keywords] = await Promise.all([
    prisma.strategyPage.findMany({
      where: { strategy_id: strategyId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, kind: true, hub_page_id: true, h1: true },
    }),
    prisma.strategyKeyword.findMany({
      where: { strategy_id: strategyId, page_id: { not: null }, OR: [{ role: "MAIN" }, { angle: true }] },
      orderBy: [{ volume: { sort: "desc", nulls: "last" } }, { canonical_keyword: "asc" }],
      select: { page_id: true, role: true, keyword: true, canonical_keyword: true, angle: true },
    }),
  ]);
  const mainOf = new Map(keywords.filter((keyword) => keyword.role === "MAIN").map((keyword) => [keyword.page_id!, keyword]));
  return {
    pages: pages.flatMap((page) => {
      const main = mainOf.get(page.id);
      if (!main) return [];
      const hub = page.hub_page_id ? (mainOf.get(page.hub_page_id)?.canonical_keyword ?? null) : null;
      return [{ keyword: main.keyword, canonical: main.canonical_keyword, h1: page.h1, kind: page.kind, hub }];
    }),
    angles: keywords
      .filter((keyword) => keyword.angle && keyword.role !== "MAIN" && mainOf.has(keyword.page_id!))
      .map((keyword) => ({ keyword: keyword.keyword, canonical: keyword.canonical_keyword, page: mainOf.get(keyword.page_id!)!.canonical_keyword })),
  };
}

/**
 * Un lotto di al più ANGLE_ADVICE_BATCH_SIZE angoli della strategia salvata al modello (T-6901), poi la fase si ripete
 * finché li ha visti tutti; i consigli si salvano con gli angoli e il cursore nella stessa transazione. Senza angoli, con
 * l'AI spenta o oltre il tetto, o con un lotto senza risposta valida il lavoro si chiude a completed senza altri consigli
 * e senza toccare grouping_notice.
 */
async function adviseStep({ run, lease, deadlineMs }: PlanPhaseContext): Promise<void> {
  const strategyId = run.strategy_id;
  const state = adviseCursorOf(run.cursor) ?? { offset: 0 };
  const inputs = strategyId ? await adviceInputs(strategyId) : { pages: [], angles: [] };
  const batch = inputs.angles.slice(state.offset, state.offset + ANGLE_ADVICE_BATCH_SIZE);
  if (!strategyId || batch.length === 0) return writePlanRun(prisma, lease, COMPLETED);
  const ai = await planAi(run, deadlineMs);
  if ("off" in ai) return writePlanRun(prisma, lease, COMPLETED);
  const { language, country } = await resolveStrategyTarget(requesterOf(run), run.project_id, requestOf(run));
  const result = await adviseAngles(batch, inputs.pages, { language, country, ai });
  const offset = state.offset + batch.length;
  const last = !result.ok || offset >= inputs.angles.length;
  await prisma.$transaction(async (tx) => {
    for (const [canonical, advice] of result.advice) {
      await tx.strategyKeyword.updateMany({
        where: { strategy_id: strategyId, canonical_keyword: canonical, angle: true },
        data: { angle_advice: advice },
      });
    }
    await writePlanRun(tx, lease, last ? COMPLETED : { cursor: { ...cursorObject(run.cursor), advise: { offset } } });
  });
}

/**
 * Fase advise (T-6901): un errore qui chiude il lavoro a completed senza altri consigli, mai a failed, perché la
 * strategia è già salvata; solo la lease persa esce, come nelle altre fasi.
 */
async function advisePhase(context: PlanPhaseContext): Promise<PlanPhaseOutcome> {
  try {
    await adviseStep(context);
  } catch (error) {
    if (error instanceof PlanRunLeaseLostError) throw error;
    logger.error("plan_angle_advice_failed", { runId: context.run.id, error });
    await writePlanRun(prisma, context.lease, COMPLETED);
  }
  return undefined;
}

/** Fase per nome, nell'ordine di PLAN_RUN_PHASES. */
export const PLAN_PHASES: Record<Exclude<PlanRunPhase, "done">, (context: PlanPhaseContext) => Promise<PlanPhaseOutcome>> = {
  volumes: volumesPhase,
  serps_post: serpsPostPhase,
  serps_collect: serpsCollectPhase,
  classify: classifyPhase,
  cluster: clusterPhase,
  save: savePhase,
  advise: advisePhase,
};
