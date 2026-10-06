import { Prisma, type Job, type JobMetric, type JobPhase, type JobStatus } from "@/lib/generated/prisma/client";
import { getIntEnv } from "@/lib/env";
import { prepareBlacklist } from "@/lib/modules/brand-filter";
import { dedupeCandidates, type DedupedCandidate, type RawKeywordCandidate } from "@/lib/modules/dedupe";
import { buildExpansionQueries } from "@/lib/modules/expansion-engine";
import { ACTIVE_JOB_STATUSES, failActiveJob, toPublicJobError } from "@/lib/modules/jobs/job-state";
import {
  AUTOCOMPLETE_FAILURE_THRESHOLD,
  buildCandidateRows,
  loadImportedMetrics,
  mapWithConcurrency,
  storeCandidates,
} from "@/lib/modules/pipeline/candidates";
import { AutocompleteUnavailableError, NoSeedsError } from "@/lib/modules/pipeline/errors";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { type EffectiveProjectSettings, resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { createAutocompleteProvider } from "@/lib/modules/providers/autocomplete/factory";
import { AutocompleteQueryFailedError } from "@/lib/modules/providers/autocomplete/types";
import { DATAFORSEO_BATCH_SIZE } from "@/lib/modules/providers/metrics/dataforseo";
import { createMetricsProvider } from "@/lib/modules/providers/metrics/factory";
import { type KeywordMetric, type MetricsOutcome, toMetricsResult } from "@/lib/modules/providers/metrics/types";
import { parseSeedsFromRows } from "@/lib/modules/seed-parser";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

// Estrazione a passi ripartibili (T-1202): ogni chiamata prende il lease del job, esegue la fase corrente a batch
// fino alla scadenza e salva staging, cursore e avanzamento a ogni batch in un'unica transazione. Richiamata dopo un
// crash, riparte dal cursore salvato e produce lo stesso risultato dell'esecuzione in un colpo solo.

/** Il lease scade 30 s dopo la scadenza del passo: margine per l'ultimo batch iniziato prima della scadenza. */
const LEASE_GRACE_MS = 30_000;
/** Attesa massima di una connessione per le transazioni dei batch; il timeout arriva da EXTRACTION_TX_TIMEOUT_MS. */
const BATCH_TX_MAX_WAIT_MS = 10_000;
/** Canonical per batch della fase metrics: un lotto di DataForSEO, quindi una richiesta al fornitore per batch. */
const METRICS_BATCH_SIZE = DATAFORSEO_BATCH_SIZE;
const BUDGET_NOTICES = new Set(["METRICS_BUDGET_EXCEEDED", "RUN_BUDGET_EXCEEDED"]);

/** Totali dell'arricchimento accumulati tra i batch della fase metrics (l'esito senza la mappa delle metriche). */
type MetricsTotals = Omit<MetricsOutcome, "metrics">;

/** Stato salvato in jobs.cursor: impostazioni effettive e seed fissate in expand, query e contatori. */
type JobCursor = {
  settings?: EffectiveProjectSettings;
  seeds?: string[];
  queries?: string[];
  truncated?: boolean;
  skippedQueries?: number;
  failedQueries?: number;
  metrics?: MetricsTotals;
};

export type ExtractionSummary = {
  queries: number;
  rawSuggestions: number;
  dedupedCandidates: number;
  storedCandidates: number;
  partial?: boolean;
  failedQueries?: number;
  truncated?: boolean;
  skippedQueries?: number;
} & ReturnType<typeof toMetricsResult>;

export type AdvanceResult = {
  status: JobStatus;
  phase: JobPhase;
  progressDone: number;
  progressTotal: number;
  more: boolean;
  skipped?: "lease_busy";
  /** Errore che ha portato il job a failed senza nuovi tentativi: sezione senza seed o autocomplete sopra soglia. */
  error?: Error;
};

/** Lease del passo in corso: ogni scrittura del job la richiede, così un passo che l'ha persa non scrive. */
type Lease = { jobId: string; lockedUntil: Date };

class LeaseLostError extends Error {
  constructor() {
    super("Lease del job perso");
    this.name = "LeaseLostError";
  }
}

function toResult(job: Job, more: boolean, extra: Pick<AdvanceResult, "skipped" | "error"> = {}): AdvanceResult {
  return {
    status: job.status,
    phase: job.phase,
    progressDone: job.progress_done,
    progressTotal: job.progress_total,
    more,
    ...extra,
  };
}

function inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(work, { timeout: getIntEnv("EXTRACTION_TX_TIMEOUT_MS"), maxWait: BATCH_TX_MAX_WAIT_MS });
}

/** Aggiorna il job solo se il lease è ancora di questo passo; heartbeat_at = adesso. */
async function writeJob(tx: Prisma.TransactionClient, lease: Lease, data: Prisma.JobUpdateManyMutationInput): Promise<void> {
  const { count } = await tx.job.updateMany({
    where: { id: lease.jobId, status: "running", locked_until: lease.lockedUntil },
    data: { ...data, heartbeat_at: new Date() },
  });
  if (count !== 1) {
    throw new LeaseLostError();
  }
}

async function deleteStaging(tx: Prisma.TransactionClient, jobId: string): Promise<void> {
  await tx.jobSuggestion.deleteMany({ where: { job_id: jobId } });
  await tx.jobMetric.deleteMany({ where: { job_id: jobId } });
}

function readCursor(job: Job): JobCursor & { settings: EffectiveProjectSettings } {
  const cursor = (job.cursor ?? {}) as JobCursor;
  if (!cursor.settings) {
    throw new Error(`Job ${job.id}: cursore senza impostazioni nella fase ${job.phase}`);
  }
  return { ...cursor, settings: cursor.settings };
}

function toCursorJson(cursor: JobCursor): Prisma.InputJsonValue {
  return cursor as Prisma.InputJsonValue;
}

/** Seed e suggerimenti nell'ordine dell'esecuzione in un colpo solo (seed, poi query per query), deduplicati. */
async function loadCandidates(
  db: Prisma.TransactionClient,
  jobId: string,
  cursor: JobCursor & { settings: EffectiveProjectSettings }
): Promise<{ candidates: DedupedCandidate[]; rawCount: number }> {
  const rows = await db.jobSuggestion.findMany({
    where: { job_id: jobId },
    orderBy: [{ query_index: "asc" }, { id: "asc" }],
    select: { keyword: true, source: true, source_query: true },
  });
  const raw: RawKeywordCandidate[] = (cursor.seeds ?? []).map((seed) => ({ keyword: seed, source: "seed", sourceQuery: seed }));
  for (const row of rows) {
    raw.push({ keyword: row.keyword, source: row.source, sourceQuery: row.source_query });
  }
  return { candidates: dedupeCandidates(raw, cursor.settings.language_code), rawCount: raw.length };
}

/** Fase expand: impostazioni effettive, seed e query fissate nel cursore. */
async function expandBatch(job: Job, lease: Lease): Promise<void> {
  const subproject = await prisma.subproject.findUnique({
    where: { id: job.subproject_id },
    include: {
      seeds: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
      project: true,
    },
  });
  if (!subproject) {
    throw new Error(`Sottoprogetto ${job.subproject_id} non trovato`);
  }

  const settings = resolveEffectiveProjectSettings({ project: subproject.project, subproject });
  const seeds = parseSeedsFromRows(subproject.seeds);
  if (seeds.length === 0) {
    throw new NoSeedsError(subproject.id);
  }

  const patternRows = await prisma.expansionPattern.findMany({
    where: {
      enabled: true,
      OR: [{ project_id: null }, { project_id: job.project_id }],
    },
    orderBy: [{ project_id: "desc" }, { pattern: "asc" }],
  });
  const expansion = buildExpansionQueries({
    seeds,
    expandAlpha: settings.expand_alpha,
    expandNumeric: settings.expand_numeric,
    expandPatterns: settings.expand_patterns,
    patterns: patternRows.map((row) => row.pattern),
    limit: getIntEnv("MAX_EXPANSION_QUERIES"),
  });

  const cursor: JobCursor = {
    settings,
    seeds,
    queries: expansion.queries,
    truncated: expansion.truncated,
    skippedQueries: expansion.skippedQueries,
    failedQueries: 0,
  };
  await inTransaction((tx) =>
    writeJob(tx, lease, {
      phase: "autocomplete",
      cursor: toCursorJson(cursor),
      progress_done: 0,
      progress_total: expansion.queries.length,
    })
  );
}

/** Fase autocomplete: JOB_AUTOCOMPLETE_BATCH query, suggerimenti nello staging con l'indice della query. */
async function autocompleteBatch(job: Job, lease: Lease): Promise<void> {
  const cursor = readCursor(job);
  const queries = cursor.queries ?? [];
  const start = job.progress_done;
  const batch = queries.slice(start, start + getIntEnv("JOB_AUTOCOMPLETE_BATCH"));
  const autocomplete = createAutocompleteProvider(cursor.settings.autocomplete_provider);

  let failed = 0;
  const suggestionsByQuery = await mapWithConcurrency(batch, getIntEnv("AUTOCOMPLETE_CONCURRENCY"), async (query) => {
    try {
      return await autocomplete.suggest({
        query,
        languageCode: cursor.settings.language_code,
        countryCode: cursor.settings.country_code,
      });
    } catch (error) {
      if (!(error instanceof AutocompleteQueryFailedError)) {
        throw error;
      }
      failed += 1;
      return [];
    }
  });

  const done = start + batch.length;
  const failedQueries = (cursor.failedQueries ?? 0) + failed;
  // A fine fase, prima di qualunque scrittura dei risultati: sopra soglia quelli salvati in precedenza restano.
  if (done >= queries.length && failedQueries / queries.length > AUTOCOMPLETE_FAILURE_THRESHOLD) {
    throw new AutocompleteUnavailableError(failedQueries, queries.length);
  }

  const rows = suggestionsByQuery.flatMap((suggestions, offset) =>
    suggestions.map((row) => ({
      job_id: job.id,
      query_index: start + offset,
      keyword: row.keyword,
      source: row.source,
      source_query: row.sourceQuery,
    }))
  );
  const next = toCursorJson({ ...cursor, failedQueries });

  await inTransaction(async (tx) => {
    if (rows.length > 0) {
      await tx.jobSuggestion.createMany({ data: rows, skipDuplicates: true });
    }
    if (done < queries.length) {
      await writeJob(tx, lease, { cursor: next, progress_done: done });
      return;
    }
    const { candidates } = await loadCandidates(tx, job.id, cursor);
    await writeJob(tx, lease, { cursor: next, phase: "metrics", progress_done: 0, progress_total: candidates.length });
  });
}

function addMetricsTotals(totals: MetricsTotals = {}, outcome: MetricsOutcome): MetricsTotals {
  const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  const notice = totals.notice ?? outcome.notice;
  const costUsd = sum(totals.costUsd, outcome.costUsd);
  const requests = sum(totals.requests, outcome.requests);
  const spellCorrected = sum(totals.spellCorrected, outcome.spellCorrected);
  const skipped = { ...totals.skipped };
  for (const [reason, count] of Object.entries(outcome.skipped ?? {})) {
    skipped[reason] = (skipped[reason] ?? 0) + count;
  }
  return {
    ...(notice ? { notice } : {}),
    ...(costUsd !== undefined ? { costUsd: Math.round(costUsd * 10_000) / 10_000 } : {}),
    ...(requests !== undefined ? { requests } : {}),
    ...(spellCorrected !== undefined ? { spellCorrected } : {}),
    ...(Object.keys(skipped).length > 0 ? { skipped } : {}),
  };
}

function toJobMetricRow(jobId: string, metric: KeywordMetric): Prisma.JobMetricCreateManyInput {
  return {
    job_id: jobId,
    canonical_keyword: metric.keyword,
    metrics_status: metric.metrics_status,
    metrics_provider: metric.metrics_provider,
    metrics_precision: metric.metrics_precision ?? null,
    avg_monthly_searches: metric.avg_monthly_searches ?? null,
    competition: metric.competition ?? null,
    low_top_of_page_bid_micros: metric.low_top_of_page_bid_micros ?? null,
    high_top_of_page_bid_micros: metric.high_top_of_page_bid_micros ?? null,
  };
}

/**
 * Fase metrics: un batch di canonical arricchito con il provider della sezione e salvato in job_metrics. Dopo un
 * tetto di spesa (T-903) i batch successivi non chiamano il fornitore e le loro keyword restano senza volumi.
 */
async function metricsBatch(job: Job, lease: Lease): Promise<void> {
  const cursor = readCursor(job);
  const { candidates } = await loadCandidates(prisma, job.id, cursor);
  const start = job.progress_done;
  const batch = candidates.slice(start, start + METRICS_BATCH_SIZE);
  const canonicals = batch.map((item) => item.canonicalKeyword);

  const outcome = BUDGET_NOTICES.has(cursor.metrics?.notice ?? "")
    ? null
    : await createMetricsProvider(cursor.settings.metrics_provider).enrichKeywords(
        batch.map((item) => ({ displayKeyword: item.keyword, canonical: item.canonicalKeyword })),
        {
          languageCode: cursor.settings.language_code,
          countryCode: cursor.settings.country_code,
          projectId: job.project_id,
          jobId: job.id,
        }
      );

  const done = start + batch.length;
  const next = toCursorJson(outcome ? { ...cursor, metrics: addMetricsTotals(cursor.metrics, outcome) } : cursor);

  await inTransaction(async (tx) => {
    if (outcome) {
      const rows = canonicals.flatMap((canonical) => {
        const metric = outcome.metrics.get(canonical);
        return metric ? [toJobMetricRow(job.id, { ...metric, keyword: canonical })] : [];
      });
      // Upsert per (job_id, canonical_keyword): le righe del batch sostituiscono quelle eventualmente già presenti.
      await tx.jobMetric.deleteMany({ where: { job_id: job.id, canonical_keyword: { in: canonicals } } });
      if (rows.length > 0) {
        await tx.jobMetric.createMany({ data: rows });
      }
    }
    await writeJob(
      tx,
      lease,
      done < candidates.length
        ? { cursor: next, progress_done: done }
        : { cursor: next, phase: "store", progress_done: 0, progress_total: candidates.length }
    );
  });
}

function fromJobMetricRow(row: JobMetric): KeywordMetric {
  return {
    keyword: row.canonical_keyword,
    metrics_status: row.metrics_status,
    metrics_provider: row.metrics_provider,
    metrics_precision: row.metrics_precision ?? undefined,
    avg_monthly_searches: row.avg_monthly_searches ?? undefined,
    competition: row.competition ?? undefined,
    low_top_of_page_bid_micros: row.low_top_of_page_bid_micros ?? undefined,
    high_top_of_page_bid_micros: row.high_top_of_page_bid_micros ?? undefined,
  };
}

/**
 * Fase store: righe costruite come nell'esecuzione in un colpo solo e scritte con la conservazione della revisione
 * di T-705 nella transazione con timeout esplicito di T-706, insieme al completamento del job e alla pulizia dello
 * staging.
 */
async function storeBatch(job: Job, lease: Lease): Promise<void> {
  const cursor = readCursor(job);
  const settings = cursor.settings;
  const { candidates, rawCount } = await loadCandidates(prisma, job.id, cursor);
  const metricRows = await prisma.jobMetric.findMany({ where: { job_id: job.id } });
  const metrics = new Map(metricRows.map((row) => [row.canonical_keyword, fromJobMetricRow(row)]));

  const blacklistRows = await prisma.brandBlacklist.findMany({
    where: {
      OR: [{ project_id: null }, { project_id: job.project_id }],
    },
  });
  // Una sola preparazione per job; i brand restano nel testo originale per brand_reason.
  const blacklist = prepareBlacklist(blacklistRows.map((row) => row.brand), settings.language_code);
  const imported = settings.metrics_provider === "NONE" ? await loadImportedMetrics(job.subproject_id) : new Map();

  const now = new Date();
  const rows = buildCandidateRows({ candidates, settings, blacklist, metrics, imported, now });
  const failedQueries = cursor.failedQueries ?? 0;
  const summary: ExtractionSummary = {
    queries: cursor.queries?.length ?? 0,
    rawSuggestions: rawCount,
    dedupedCandidates: candidates.length,
    storedCandidates: rows.length,
    partial: failedQueries > 0,
    failedQueries,
    truncated: cursor.truncated,
    skippedQueries: cursor.skippedQueries,
    ...toMetricsResult({ metrics: new Map(), ...cursor.metrics }),
  };

  await inTransaction(async (tx) => {
    await storeCandidates(tx, job.project_id, job.subproject_id, rows, now);
    await deleteStaging(tx, job.id);
    await writeJob(tx, lease, {
      status: "completed",
      phase: "done",
      completed_at: now,
      result: summary,
      locked_until: null,
      progress_done: candidates.length,
    });
    await touchProjectActivity(tx, job.project_id, now);
  });
}

/** Annullamento richiesto (T-1204): job canceled, staging eliminato, keyword_candidates della sezione invariati. */
async function cancelJob(job: Job, lease: Lease): Promise<void> {
  await inTransaction(async (tx) => {
    await deleteStaging(tx, job.id);
    await writeJob(tx, lease, { status: "canceled", completed_at: new Date(), locked_until: null });
  });
}

const BATCHES: Record<Exclude<JobPhase, "done">, (job: Job, lease: Lease) => Promise<void>> = {
  expand: expandBatch,
  autocomplete: autocompleteBatch,
  metrics: metricsBatch,
  store: storeBatch,
};

/**
 * Avanza il job fino a deadlineMs (istante assoluto in ms epoch). Lease con compare-and-set (CWE-362): se è di un
 * altro passo ritorna skipped='lease_busy' senza lavoro. Esegue sempre almeno un batch; prima di ogni batch
 * successivo, a scadenza superata, rilascia il lease e ritorna more=true. Un'eccezione dentro un batch annulla la
 * sua transazione e lascia scadere il lease (il recupero è di T-1203); sezione senza seed e autocomplete sopra
 * soglia portano invece il job a failed con il messaggio pubblico (T-706, T-306).
 */
export async function advanceJob(jobId: string, deadlineMs: number): Promise<AdvanceResult> {
  // Timestamp dell'applicazione e non now() del DB: i test spostano l'orologio con vi.setSystemTime.
  const now = new Date();
  const lease: Lease = { jobId, lockedUntil: new Date(Math.floor(deadlineMs) + LEASE_GRACE_MS) };
  const acquired = await prisma.job.updateMany({
    where: {
      id: jobId,
      status: { in: ACTIVE_JOB_STATUSES },
      OR: [{ locked_until: null }, { locked_until: { lt: now } }],
    },
    data: { status: "running", locked_until: lease.lockedUntil, heartbeat_at: now },
  });
  if (acquired.count === 0) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    return toResult(job, false, ACTIVE_JOB_STATUSES.includes(job.status) ? { skipped: "lease_busy" } : {});
  }
  await prisma.job.updateMany({ where: { id: jobId, started_at: null }, data: { started_at: now } });

  for (let batch = 0; ; batch += 1) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status !== "running" || job.locked_until?.getTime() !== lease.lockedUntil.getTime()) {
      return toResult(job, false, job.status === "running" ? { skipped: "lease_busy" } : {});
    }

    if (batch > 0 && Date.now() > deadlineMs) {
      await prisma.job.updateMany({ where: { id: jobId, locked_until: lease.lockedUntil }, data: { locked_until: null } });
      return toResult({ ...job, locked_until: null }, true);
    }

    try {
      if (job.cancel_requested) {
        await cancelJob(job, lease);
      } else if (job.phase !== "done") {
        await BATCHES[job.phase](job, lease);
      }
    } catch (error) {
      if (error instanceof LeaseLostError) {
        continue;
      }
      if (!(error instanceof NoSeedsError) && !(error instanceof AutocompleteUnavailableError)) {
        throw error;
      }
      logger.error("job_failed", { jobId, projectId: job.project_id, subprojectId: job.subproject_id, error });
      await failActiveJob(job, toPublicJobError(error));
      return toResult(await prisma.job.findUniqueOrThrow({ where: { id: jobId } }), false, { error });
    }
  }
}
