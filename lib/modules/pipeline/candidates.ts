import { Prisma, type KeywordCandidate } from "@/lib/generated/prisma/client";
import { evaluateBrandStatus, type PreparedBrand } from "@/lib/modules/brand-filter";
import { classifyKeyword } from "@/lib/modules/classification";
import type { DedupedCandidate } from "@/lib/modules/dedupe";
import type { EffectiveProjectSettings } from "@/lib/modules/project-settings";
import type { KeywordMetric } from "@/lib/modules/providers/metrics/types";
import { scoreKeyword } from "@/lib/modules/scoring";
import { prisma } from "@/lib/prisma";

// Mattoni dell'estrazione usati dai passi del job (T-1202): costruzione e scrittura delle righe di
// keyword_candidates, volumi importati da Keyword Planner e concorrenza dell'autocomplete.

/** Quota di query di autocomplete fallite oltre la quale l'estrazione fallisce senza toccare i risultati. */
export const AUTOCOMPLETE_FAILURE_THRESHOLD = 0.3;

/** Riga di keyword_candidates preparata dalla pipeline; id, project_id, subproject_id e date li mette la scrittura. */
type CandidateRow = Omit<KeywordCandidate, "id" | "project_id" | "subproject_id" | "created_at" | "updated_at">;

/** Volume importato da Keyword Planner per un canonical, con la data dell'import. */
type ImportedMetric = { metric: KeywordMetric; at: Date | null };

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

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

/**
 * Scrittura dei risultati secondo D-19 (T-705): le keyword ancora prodotte restano con lo stesso id,
 * review_status e selected_for_export e ricevono metriche, punteggio e classificazione nuovi; le nuove
 * entrano con i default; quelle non più prodotte vengono rimosse dalla sola sezione del job.
 * L'upsert usa la chiave unica (subproject_id, canonical_keyword) a blocchi di UPSERT_CHUNK_SIZE righe
 * e solo parametri di Prisma.sql. Caso limite: una keyword il cui canonical cambia per una nuova regola
 * di normalizzazione (T-702) è trattata come nuova al primo re-run successivo.
 */
export async function storeCandidates(
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

export async function mapWithConcurrency<T, R>(
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

/**
 * Volumi importati da Keyword Planner nella sezione (T-910, D-19 emendata il 2026-10-06): con il provider effettivo
 * NONE una keyword ancora prodotta li conserva, con la data dell'import, invece di restare senza metriche.
 */
export async function loadImportedMetrics(subprojectId: string): Promise<Map<string, ImportedMetric>> {
  const rows = await prisma.keywordCandidate.findMany({
    where: { subproject_id: subprojectId, metrics_provider: "PLANNER_CSV" },
    select: {
      canonical_keyword: true,
      metrics_status: true,
      metrics_precision: true,
      avg_monthly_searches: true,
      competition: true,
      low_top_of_page_bid_micros: true,
      high_top_of_page_bid_micros: true,
      metrics_updated_at: true,
    },
  });
  return new Map(
    rows.map((row: (typeof rows)[number]) => [
      row.canonical_keyword,
      {
        metric: {
          keyword: row.canonical_keyword,
          metrics_status: row.metrics_status,
          metrics_provider: "PLANNER_CSV" as const,
          metrics_precision: row.metrics_precision ?? undefined,
          avg_monthly_searches: row.avg_monthly_searches ?? undefined,
          competition: row.competition ?? undefined,
          low_top_of_page_bid_micros: row.low_top_of_page_bid_micros ?? undefined,
          high_top_of_page_bid_micros: row.high_top_of_page_bid_micros ?? undefined,
        },
        at: row.metrics_updated_at,
      },
    ])
  );
}

/**
 * Righe da salvare per le candidate deduplicate: filtro brand, classificazione, metriche (prima i volumi importati,
 * poi quelle del provider, altrimenti missing), filtro min_volume e punteggio.
 */
export function buildCandidateRows(input: {
  candidates: DedupedCandidate[];
  settings: EffectiveProjectSettings;
  blacklist: PreparedBrand[];
  metrics: Map<string, KeywordMetric>;
  imported: Map<string, ImportedMetric>;
  now: Date;
}): CandidateRow[] {
  const { candidates, settings: effective, blacklist, metrics, imported, now } = input;
  const preparedRows: CandidateRow[] = [];

  for (const candidate of candidates) {
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

    const kept = imported.get(candidate.canonicalKeyword);
    const metric = kept?.metric ??
      metrics.get(candidate.canonicalKeyword) ?? {
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
      metrics_updated_at: kept ? kept.at : metric.metrics_status === "missing" ? null : now,
    });
  }

  return preparedRows;
}
