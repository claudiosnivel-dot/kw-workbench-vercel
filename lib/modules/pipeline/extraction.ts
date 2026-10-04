import { MetricsProvider, Prisma } from "@prisma/client";
import { getIntEnv } from "@/lib/env";
import { evaluateBrandStatus } from "@/lib/modules/brand-filter";
import { classifyKeyword } from "@/lib/modules/classification";
import { dedupeCandidates, RawKeywordCandidate } from "@/lib/modules/dedupe";
import { buildExpansionQueries } from "@/lib/modules/expansion-engine";
import { createAutocompleteProvider } from "@/lib/modules/providers/autocomplete/factory";
import { createMetricsProvider } from "@/lib/modules/providers/metrics/factory";
import { buildMissingMetrics } from "@/lib/modules/providers/metrics/types";
import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { scoreKeyword } from "@/lib/modules/scoring";
import { parseSeedsFromRows } from "@/lib/modules/seed-parser";
import { prisma } from "@/lib/prisma";

type ExtractionSummary = {
  queries: number;
  rawSuggestions: number;
  dedupedCandidates: number;
  storedCandidates: number;
};

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
      seeds: true,
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
    await prisma.keywordCandidate.deleteMany({ where: { project_id: subproject.project_id, subproject_id: subproject.id } });
    return { queries: 0, rawSuggestions: 0, dedupedCandidates: 0, storedCandidates: 0 };
  }

  const patternRows = await prisma.expansionPattern.findMany({
    where: {
      enabled: true,
      OR: [{ project_id: null }, { project_id: subproject.project_id }],
    },
    orderBy: [{ project_id: "desc" }, { pattern: "asc" }],
  });

  const queries = buildExpansionQueries({
    seeds,
    expandAlpha: effective.expand_alpha,
    expandNumeric: effective.expand_numeric,
    expandPatterns: effective.expand_patterns,
    patterns: patternRows.map((row) => row.pattern),
  });

  const queryLimit = getIntEnv("MAX_EXPANSION_QUERIES");
  const selectedQueries = queries.slice(0, queryLimit);

  const autocomplete = createAutocompleteProvider(effective.autocomplete_provider);
  const rawSuggestions: RawKeywordCandidate[] = seeds.map((seed) => ({
    keyword: seed,
    source: "seed",
    sourceQuery: seed,
  }));

  const autocompleteConcurrency = getIntEnv("AUTOCOMPLETE_CONCURRENCY");

  const suggestionsByQuery = await mapWithConcurrency(
    selectedQueries,
    autocompleteConcurrency,
    async (query) => {
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
    }
  );

  for (const list of suggestionsByQuery) {
    for (const item of list) {
      rawSuggestions.push(item);
    }
  }

  const deduped = dedupeCandidates(rawSuggestions);

  const blacklistRows = await prisma.brandBlacklist.findMany({
    where: {
      OR: [{ project_id: null }, { project_id: subproject.project_id }],
    },
  });
  const blacklist = blacklistRows.map((row) => row.brand.toLowerCase());

  const metricsProvider = createMetricsProvider(effective.metrics_provider);
  const metricKeys = deduped.map((item) => item.canonicalKeyword);
  const metrics =
    metricKeys.length > 0
      ? await metricsProvider.enrichKeywords(metricKeys, {
          languageCode: effective.language_code,
          countryCode: effective.country_code,
        })
      : buildMissingMetrics([], effective.metrics_provider as MetricsProvider, "missing");

  const now = new Date();
  const preparedRows: Prisma.KeywordCandidateCreateManyInput[] = [];

  for (const candidate of deduped) {
    const brand = evaluateBrandStatus({
      keyword: candidate.keyword,
      blacklist,
      excludeBrands: effective.exclude_brands,
    });

    const classification = effective.auto_classification
      ? classifyKeyword(candidate.keyword)
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

    const score = scoreKeyword({
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
      project_id: subproject.project_id,
      subproject_id: subproject.id,
      keyword: candidate.keyword,
      normalized_keyword: candidate.normalizedKeyword,
      canonical_keyword: candidate.canonicalKeyword,
      source: candidate.source,
      source_query: candidate.sourceQuery,
      brand_status: brand.brand_status,
      brand_reason: brand.brand_reason,
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
      avg_monthly_searches: metric.avg_monthly_searches,
      competition: metric.competition,
      low_top_of_page_bid_micros: metric.low_top_of_page_bid_micros,
      high_top_of_page_bid_micros: metric.high_top_of_page_bid_micros,
      score,
      metrics_updated_at: metric.metrics_status === "missing" ? null : now,
    });
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.keywordCandidate.deleteMany({ where: { project_id: subproject.project_id, subproject_id: subproject.id } });

    for (const part of chunk(preparedRows, 500)) {
      if (part.length > 0) {
        await tx.keywordCandidate.createMany({ data: part });
      }
    }
  });

  return {
    queries: selectedQueries.length,
    rawSuggestions: rawSuggestions.length,
    dedupedCandidates: deduped.length,
    storedCandidates: preparedRows.length,
  };
}
