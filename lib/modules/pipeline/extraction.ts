import { MetricsProvider, Prisma } from "@prisma/client";
import { evaluateBrandStatus } from "@/lib/modules/brand-filter";
import { classifyKeyword } from "@/lib/modules/classification";
import { dedupeCandidates, RawKeywordCandidate } from "@/lib/modules/dedupe";
import { buildExpansionQueries } from "@/lib/modules/expansion-engine";
import { createAutocompleteProvider } from "@/lib/modules/providers/autocomplete/factory";
import { createMetricsProvider } from "@/lib/modules/providers/metrics/factory";
import { buildMissingMetrics } from "@/lib/modules/providers/metrics/types";
import { scoreKeyword } from "@/lib/modules/scoring";
import { parseSeedsFromRows } from "@/lib/modules/seed-parser";
import { prisma } from "@/lib/prisma";

type ExtractionSummary = {
  queries: number;
  rawSuggestions: number;
  dedupedCandidates: number;
  storedCandidates: number;
};

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function runExtractionPipeline(projectId: string): Promise<ExtractionSummary> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { seeds: true },
  });

  if (!project) {
    throw new Error(`Progetto ${projectId} non trovato`);
  }

  const seeds = parseSeedsFromRows(project.seeds);
  if (seeds.length === 0) {
    await prisma.keywordCandidate.deleteMany({ where: { project_id: project.id } });
    return { queries: 0, rawSuggestions: 0, dedupedCandidates: 0, storedCandidates: 0 };
  }

  const patternRows = await prisma.expansionPattern.findMany({
    where: {
      enabled: true,
      OR: [{ project_id: null }, { project_id: project.id }],
    },
    orderBy: [{ project_id: "desc" }, { pattern: "asc" }],
  });

  const queries = buildExpansionQueries({
    seeds,
    expandAlpha: project.expand_alpha,
    expandNumeric: project.expand_numeric,
    expandPatterns: project.expand_patterns,
    patterns: patternRows.map((row) => row.pattern),
  });

  const queryLimit = Math.max(50, Number(process.env.MAX_EXPANSION_QUERIES ?? 250));
  const selectedQueries = queries.slice(0, queryLimit);

  const autocomplete = createAutocompleteProvider(project.autocomplete_provider);
  const rawSuggestions: RawKeywordCandidate[] = seeds.map((seed) => ({
    keyword: seed,
    source: "seed",
    sourceQuery: seed,
  }));

  for (const query of selectedQueries) {
    const suggestions = await autocomplete.suggest({
      query,
      languageCode: project.language_code,
      countryCode: project.country_code,
    });

    for (const row of suggestions) {
      rawSuggestions.push({
        keyword: row.keyword,
        source: row.source,
        sourceQuery: row.sourceQuery,
      });
    }
  }

  const deduped = dedupeCandidates(rawSuggestions);

  const blacklistRows = await prisma.brandBlacklist.findMany({
    where: {
      OR: [{ project_id: null }, { project_id: project.id }],
    },
  });
  const blacklist = blacklistRows.map((row) => row.brand.toLowerCase());

  const metricsProvider = createMetricsProvider(project.metrics_provider);
  const metricKeys = deduped.map((item) => item.canonicalKeyword);
  const metrics =
    metricKeys.length > 0
      ? await metricsProvider.enrichKeywords(metricKeys, {
          languageCode: project.language_code,
          countryCode: project.country_code,
        })
      : buildMissingMetrics([], project.metrics_provider as MetricsProvider, "missing");

  const now = new Date();
  const preparedRows: Prisma.KeywordCandidateCreateManyInput[] = [];

  for (const candidate of deduped) {
    const brand = evaluateBrandStatus({
      keyword: candidate.keyword,
      blacklist,
      excludeBrands: project.exclude_brands,
    });

    const classification = project.auto_classification
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
      metrics_provider: project.metrics_provider,
    };

    if (
      typeof project.min_volume === "number" &&
      project.min_volume > 0 &&
      typeof metric.avg_monthly_searches === "number" &&
      metric.avg_monthly_searches < project.min_volume
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
      scoring_profile: project.scoring_profile,
    });

    preparedRows.push({
      project_id: project.id,
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
    await tx.keywordCandidate.deleteMany({ where: { project_id: project.id } });

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

