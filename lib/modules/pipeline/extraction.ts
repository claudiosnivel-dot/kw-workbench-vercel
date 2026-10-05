import { Prisma, type KeywordCandidate } from "@/lib/generated/prisma/client";
import { getIntEnv } from "@/lib/env";
import { evaluateBrandStatus, prepareBlacklist } from "@/lib/modules/brand-filter";
import { classifyKeyword } from "@/lib/modules/classification";
import { dedupeCandidates, RawKeywordCandidate } from "@/lib/modules/dedupe";
import { buildExpansionQueries } from "@/lib/modules/expansion-engine";
import { NoSeedsError } from "@/lib/modules/pipeline/errors";
import { createAutocompleteProvider } from "@/lib/modules/providers/autocomplete/factory";
import { AutocompleteQueryFailedError } from "@/lib/modules/providers/autocomplete/types";
import { createMetricsProvider } from "@/lib/modules/providers/metrics/factory";
import { toMetricsResult } from "@/lib/modules/providers/metrics/types";
import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { scoreKeyword } from "@/lib/modules/scoring";
import { parseSeedsFromRows } from "@/lib/modules/seed-parser";
import { prisma } from "@/lib/prisma";

/** Quota di query di autocomplete fallite oltre la quale l'estrazione fallisce senza toccare i risultati. */
export const AUTOCOMPLETE_FAILURE_THRESHOLD = 0.3;

/** Attesa massima di una connessione per la transazione finale; il timeout arriva da EXTRACTION_TX_TIMEOUT_MS. */
const EXTRACTION_TX_MAX_WAIT_MS = 10_000;

type ExtractionSummary = {
  queries: number;
  rawSuggestions: number;
  dedupedCandidates: number;
  storedCandidates: number;
  partial?: boolean;
  failedQueries?: number;
  truncated?: boolean;
  skippedQueries?: number;
} & ReturnType<typeof toMetricsResult>;

/** Riga di keyword_candidates preparata dalla pipeline; id, project_id, subproject_id e date li mette la scrittura. */
type CandidateRow = Omit<KeywordCandidate, "id" | "project_id" | "subproject_id" | "created_at" | "updated_at">;

const UPSERT_CHUNK_SIZE = 500;

// SQL statico della scrittura dei risultati: nessun valore dentro questi frammenti, i dati entrano solo
// come parametri legati (candidateValues e le interpolazioni di Prisma.sql in storeCandidates).
const UPSERT_INSERT = Prisma.sql`
  INSERT INTO "keyword_candidates" (
    "id", "project_id", "subproject_id", "keyword", "normalized_keyword", "canonical_keyword", "source",
    "source_query", "brand_status", "brand_reason", "review_status", "selected_for_export", "keyword_type",
    "search_intent", "is_question", "is_local_intent", "is_tool_intent", "is_commercial_intent",
    "metrics_status", "metrics_provider", "avg_monthly_searches", "competition", "low_top_of_page_bid_micros",
    "high_top_of_page_bid_micros", "metrics_precision", "score", "score_source", "metrics_updated_at", "created_at",
    "updated_at"
  )
  VALUES`;

// Colonne aggiornate per una keyword già presente: mai id, review_status, selected_for_export e created_at.
const UPSERT_ON_CONFLICT = Prisma.sql`
  ON CONFLICT ("subproject_id", "canonical_keyword") DO UPDATE SET
    "keyword" = EXCLUDED."keyword",
    "normalized_keyword" = EXCLUDED."normalized_keyword",
    "source" = EXCLUDED."source",
    "source_query" = EXCLUDED."source_query",
    "brand_status" = EXCLUDED."brand_status",
    "brand_reason" = EXCLUDED."brand_reason",
    "keyword_type" = EXCLUDED."keyword_type",
    "search_intent" = EXCLUDED."search_intent",
    "is_question" = EXCLUDED."is_question",
    "is_local_intent" = EXCLUDED."is_local_intent",
    "is_tool_intent" = EXCLUDED."is_tool_intent",
    "is_commercial_intent" = EXCLUDED."is_commercial_intent",
    "metrics_status" = EXCLUDED."metrics_status",
    "metrics_provider" = EXCLUDED."metrics_provider",
    "avg_monthly_searches" = EXCLUDED."avg_monthly_searches",
    "competition" = EXCLUDED."competition",
    "low_top_of_page_bid_micros" = EXCLUDED."low_top_of_page_bid_micros",
    "high_top_of_page_bid_micros" = EXCLUDED."high_top_of_page_bid_micros",
    "metrics_precision" = EXCLUDED."metrics_precision",
    "score" = EXCLUDED."score",
    "score_source" = EXCLUDED."score_source",
    "metrics_updated_at" = EXCLUDED."metrics_updated_at",
    "updated_at" = EXCLUDED."updated_at"`;

const DELETE_CANDIDATES_WHERE = Prisma.sql`DELETE FROM "keyword_candidates" WHERE`;

function candidateValues(projectId: string, subprojectId: string, row: CandidateRow, now: Date): Prisma.Sql {
  return Prisma.sql`(
    gen_random_uuid()::text, ${projectId}, ${subprojectId}, ${row.keyword}, ${row.normalized_keyword},
    ${row.canonical_keyword}, ${row.source}, ${row.source_query}, ${row.brand_status}::"BrandStatus",
    ${row.brand_reason}, ${row.review_status}::"ReviewStatus", ${row.selected_for_export},
    ${row.keyword_type}::"KeywordType", ${row.search_intent}::"SearchIntent", ${row.is_question},
    ${row.is_local_intent}, ${row.is_tool_intent}, ${row.is_commercial_intent},
    ${row.metrics_status}::"MetricsStatus", ${row.metrics_provider}::"MetricsProvider",
    ${row.avg_monthly_searches}::integer, ${row.competition}::double precision,
    ${row.low_top_of_page_bid_micros}::bigint, ${row.high_top_of_page_bid_micros}::bigint,
    ${row.metrics_precision}::"MetricsPrecision", ${row.score}::double precision, ${row.score_source}::"ScoreSource", ${row.metrics_updated_at}::timestamp(3),
    ${now}::timestamp(3), ${now}::timestamp(3)
  )`;
}

/**
 * Scrittura dei risultati secondo D-19 (T-705): le keyword ancora prodotte restano con lo stesso id,
 * review_status e selected_for_export e ricevono metriche, punteggio e classificazione nuovi; le nuove
 * entrano con i default; quelle non più prodotte vengono rimosse dalla sola sezione del job.
 * L'upsert usa la chiave unica (subproject_id, canonical_keyword) a blocchi di UPSERT_CHUNK_SIZE righe
 * e solo parametri di Prisma.sql. Caso limite: una keyword il cui canonical cambia per una nuova regola
 * di normalizzazione (T-702) è trattata come nuova al primo re-run successivo.
 */
async function storeCandidates(
  tx: Prisma.TransactionClient,
  projectId: string,
  subprojectId: string,
  rows: CandidateRow[],
  now: Date
): Promise<void> {
  for (const part of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const values = Prisma.join(part.map((row) => candidateValues(projectId, subprojectId, row, now)));
    await tx.$executeRaw`${UPSERT_INSERT} ${values} ${UPSERT_ON_CONFLICT}`;
  }

  // Un solo parametro array: un notIn di Prisma supererebbe il limite di parametri con decine di migliaia di keyword.
  const produced = rows.map((row) => row.canonical_keyword);
  await tx.$executeRaw`${DELETE_CANDIDATES_WHERE} "project_id" = ${projectId} AND "subproject_id" = ${subprojectId}
    AND "canonical_keyword" <> ALL(${produced}::text[])`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const normalizedConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: normalizedConcurrency }, () => runner());
  await Promise.all(runners);
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function runExtractionPipeline(subprojectId: string): Promise<ExtractionSummary> {
  const subproject = await prisma.subproject.findUnique({
    where: { id: subprojectId },
    include: {
      seeds: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
      project: true,
    },
  });

  if (!subproject) {
    throw new Error(`Sottoprogetto ${subprojectId} non trovato`);
  }

  const effective = resolveEffectiveProjectSettings({
    project: subproject.project,
    subproject,
  });

  const seeds = parseSeedsFromRows(subproject.seeds);
  if (seeds.length === 0) {
    throw new NoSeedsError(subproject.id);
  }

  const patternRows = await prisma.expansionPattern.findMany({
    where: {
      enabled: true,
      OR: [{ project_id: null }, { project_id: subproject.project_id }],
    },
    orderBy: [{ project_id: "desc" }, { pattern: "asc" }],
  });

  const expansion = buildExpansionQueries({
    seeds,
    expandAlpha: effective.expand_alpha,
    expandNumeric: effective.expand_numeric,
    expandPatterns: effective.expand_patterns,
    patterns: patternRows.map((row) => row.pattern),
    limit: getIntEnv("MAX_EXPANSION_QUERIES"),
  });
  const selectedQueries = expansion.queries;

  const autocomplete = createAutocompleteProvider(effective.autocomplete_provider);
  const rawSuggestions: RawKeywordCandidate[] = seeds.map((seed) => ({
    keyword: seed,
    source: "seed",
    sourceQuery: seed,
  }));

  const autocompleteConcurrency = getIntEnv("AUTOCOMPLETE_CONCURRENCY");
  let failedQueries = 0;

  const suggestionsByQuery = await mapWithConcurrency(
    selectedQueries,
    autocompleteConcurrency,
    async (query) => {
      try {
        const suggestions = await autocomplete.suggest({
          query,
          languageCode: effective.language_code,
          countryCode: effective.country_code,
        });

        return suggestions.map((row) => ({
          keyword: row.keyword,
          source: row.source,
          sourceQuery: row.sourceQuery,
        }));
      } catch (error) {
        if (!(error instanceof AutocompleteQueryFailedError)) {
          throw error;
        }
        failedQueries += 1;
        return [];
      }
    }
  );

  // Prima della transazione di scrittura: sopra soglia i risultati salvati in precedenza restano.
  if (failedQueries / selectedQueries.length > AUTOCOMPLETE_FAILURE_THRESHOLD) {
    throw new Error(`Autocomplete non disponibile: ${failedQueries} query su ${selectedQueries.length} fallite`);
  }

  for (const list of suggestionsByQuery) {
    for (const item of list) {
      rawSuggestions.push(item);
    }
  }

  const deduped = dedupeCandidates(rawSuggestions, effective.language_code);

  const blacklistRows = await prisma.brandBlacklist.findMany({
    where: {
      OR: [{ project_id: null }, { project_id: subproject.project_id }],
    },
  });
  // Una sola preparazione per job; i brand restano nel testo originale per brand_reason.
  const blacklist = prepareBlacklist(blacklistRows.map((row) => row.brand), effective.language_code);

  // Una voce per canonical: dedupeCandidates tiene la prima candidata, la stessa keyword salvata nella riga.
  const metricsProvider = createMetricsProvider(effective.metrics_provider);
  const metricsOutcome = await metricsProvider.enrichKeywords(
    deduped.map((item) => ({ displayKeyword: item.keyword, canonical: item.canonicalKeyword })),
    { languageCode: effective.language_code, countryCode: effective.country_code }
  );
  const metrics = metricsOutcome.metrics;

  const now = new Date();
  const preparedRows: CandidateRow[] = [];

  for (const candidate of deduped) {
    const brand = evaluateBrandStatus({
      keyword: candidate.keyword,
      blacklist,
      excludeBrands: effective.exclude_brands,
      languageCode: effective.language_code,
    });

    const classification = effective.auto_classification
      ? classifyKeyword(candidate.keyword, effective.language_code)
      : {
          keyword_type: "generic" as const,
          search_intent: "mixed" as const,
          is_question: false,
          is_local_intent: false,
          is_tool_intent: false,
          is_commercial_intent: false,
        };

    if (brand.matchedBrand) {
      classification.keyword_type = "branded";
    }

    const metric = metrics.get(candidate.canonicalKeyword) ?? {
      keyword: candidate.canonicalKeyword,
      metrics_status: "missing" as const,
      metrics_provider: effective.metrics_provider,
    };

    if (
      typeof effective.min_volume === "number" &&
      effective.min_volume > 0 &&
      typeof metric.avg_monthly_searches === "number" &&
      metric.avg_monthly_searches < effective.min_volume
    ) {
      continue;
    }

    const { score, score_source } = scoreKeyword({
      raw_keyword: candidate.keyword,
      keyword: candidate.normalizedKeyword,
      brand_status: brand.brand_status,
      search_intent: classification.search_intent,
      metrics_status: metric.metrics_status,
      avg_monthly_searches: metric.avg_monthly_searches,
      competition: metric.competition,
      low_top_of_page_bid_micros: metric.low_top_of_page_bid_micros,
      high_top_of_page_bid_micros: metric.high_top_of_page_bid_micros,
      scoring_profile: effective.scoring_profile,
    });

    preparedRows.push({
      keyword: candidate.keyword,
      normalized_keyword: candidate.normalizedKeyword,
      canonical_keyword: candidate.canonicalKeyword,
      source: candidate.source,
      source_query: candidate.sourceQuery,
      brand_status: brand.brand_status,
      brand_reason: brand.brand_reason ?? null,
      review_status: brand.brand_status === "excluded" ? "rejected" : "pending",
      selected_for_export: brand.brand_status !== "excluded",
      keyword_type: classification.keyword_type,
      search_intent: classification.search_intent,
      is_question: classification.is_question,
      is_local_intent: classification.is_local_intent,
      is_tool_intent: classification.is_tool_intent,
      is_commercial_intent: classification.is_commercial_intent,
      metrics_status: metric.metrics_status,
      metrics_provider: metric.metrics_provider,
      avg_monthly_searches: metric.avg_monthly_searches ?? null,
      competition: metric.competition ?? null,
      low_top_of_page_bid_micros: metric.low_top_of_page_bid_micros ?? null,
      high_top_of_page_bid_micros: metric.high_top_of_page_bid_micros ?? null,
      metrics_precision: metric.metrics_precision ?? null,
      score,
      score_source,
      metrics_updated_at: metric.metrics_status === "missing" ? null : now,
    });
  }

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await storeCandidates(tx, subproject.project_id, subproject.id, preparedRows, now);
    },
    { timeout: getIntEnv("EXTRACTION_TX_TIMEOUT_MS"), maxWait: EXTRACTION_TX_MAX_WAIT_MS }
  );

  return {
    queries: selectedQueries.length,
    rawSuggestions: rawSuggestions.length,
    dedupedCandidates: deduped.length,
    storedCandidates: preparedRows.length,
    partial: failedQueries > 0,
    failedQueries,
    truncated: expansion.truncated,
    skippedQueries: expansion.skippedQueries,
    ...toMetricsResult(metricsOutcome),
  };
}
