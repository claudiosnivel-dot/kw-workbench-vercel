import { canUseLicensedMetrics, extractionPlanLimits } from "@/lib/billing/enforce";
import { reservePartialQuota } from "@/lib/billing/usage";
import { Prisma } from "@/lib/generated/prisma/client";
import { resolveEffectiveProjectSettings } from "@/lib/modules/project-settings";
import { DataForSeoMetricsProvider } from "@/lib/modules/providers/metrics/dataforseo";
import type { KeywordMetric, MetricsItem, MetricsNotice, MetricsProviderError } from "@/lib/modules/providers/metrics/types";
import { scoreKeyword } from "@/lib/modules/scoring";
import type { StrategySettings } from "@/lib/modules/strategy/rules";
import { perimeterWhere } from "@/lib/modules/strategy/service";
import { prisma } from "@/lib/prisma";

// Volumi chiesti da soli prima del piano (T-6102, D-57): le keyword tenute del perimetro senza volume ricevono i volumi
// di DataForSEO, salvati sulle keyword come fa l'estrazione, con il punteggio ricalcolato. Tieni/scarta non cambia
// (D-19); valgono la regola dei dati con licenza (D-30), la quota mensile del fornitore con licenza (T-1703) e i tetti
// di spesa (T-903).

const UPDATE_CHUNK_SIZE = 500;
const BUDGET_NOTICES = new Set<MetricsNotice>(["METRICS_BUDGET_EXCEEDED", "RUN_BUDGET_EXCEEDED"]);

export type PerimeterVolumesOutcome = {
  /** Keyword (forme canoniche per lingua e paese) inviate al fornitore. */
  requested: number;
  /** Keyword del perimetro che hanno ricevuto il volume. */
  filled: number;
  /** Motivo per cui alcune keyword sono rimaste senza volume, per l'avviso del piano. */
  notice?: MetricsNotice;
  providerError?: MetricsProviderError;
  costUsd: number;
  requests: number;
};

const CANDIDATE_SELECT = {
  id: true,
  subproject_id: true,
  keyword: true,
  normalized_keyword: true,
  canonical_keyword: true,
  brand_status: true,
  search_intent: true,
} satisfies Prisma.KeywordCandidateSelect;

type Candidate = Prisma.KeywordCandidateGetPayload<{ select: typeof CANDIDATE_SELECT }>;

/** Keyword di una stessa lingua e paese della ricerca: una richiesta per forma canonica, il punteggio con il profilo della sezione. */
type TargetGroup = {
  languageCode: string;
  countryCode: string;
  items: MetricsItem[];
  rows: Map<string, { candidate: Candidate; scoringProfile: string }[]>;
};

/** Raggruppa le keyword per lingua e paese effettivi della loro sezione (gli override dell'argomento contano). */
async function groupByTarget(projectId: string, candidates: Candidate[]): Promise<TargetGroup[]> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { subprojects: true } });
  const sections = new Map(project.subprojects.map((section) => [section.id, resolveEffectiveProjectSettings({ project, subproject: section })]));
  const fallback = resolveEffectiveProjectSettings({ project });
  const groups = new Map<string, TargetGroup>();
  for (const candidate of candidates) {
    const effective = sections.get(candidate.subproject_id) ?? fallback;
    const key = `${effective.language_code}|${effective.country_code}`;
    let group = groups.get(key);
    if (!group) {
      group = { languageCode: effective.language_code, countryCode: effective.country_code, items: [], rows: new Map() };
      groups.set(key, group);
    }
    const rows = group.rows.get(candidate.canonical_keyword);
    const row = { candidate, scoringProfile: effective.scoring_profile };
    if (rows) {
      rows.push(row);
    } else {
      group.rows.set(candidate.canonical_keyword, [row]);
      group.items.push({ displayKeyword: candidate.keyword, canonical: candidate.canonical_keyword });
    }
  }
  return [...groups.values()];
}

/**
 * Keyword concesse dalla quota mensile del fornitore con licenza (T-1703), riservata in modo atomico prima della chiamata:
 * null = nessuna quota (root admin, lancio in pausa).
 */
async function grantedKeywords(workspaceId: string, actor: { isRootAdmin: boolean }, requested: number): Promise<number> {
  const limit = (await extractionPlanLimits(workspaceId, actor)).licensedMetricsKeywordsPerMonth;
  if (typeof limit !== "number" || requested === 0) {
    return requested;
  }
  return prisma.$transaction((tx) =>
    reservePartialQuota(tx, { workspaceId, metric: "licensed_keywords_month", now: new Date(), requested, limit })
  );
}

function updateValues(candidate: Candidate, metric: KeywordMetric, scoringProfile: string, now: Date): Prisma.Sql {
  const { score, score_source } = scoreKeyword({
    raw_keyword: candidate.keyword,
    keyword: candidate.normalized_keyword,
    brand_status: candidate.brand_status,
    search_intent: candidate.search_intent,
    metrics_status: metric.metrics_status,
    avg_monthly_searches: metric.avg_monthly_searches,
    competition: metric.competition,
    low_top_of_page_bid_micros: metric.low_top_of_page_bid_micros,
    high_top_of_page_bid_micros: metric.high_top_of_page_bid_micros,
    scoring_profile: scoringProfile,
  });
  return Prisma.sql`(
    ${candidate.id}, ${metric.metrics_status}::"MetricsStatus", ${metric.metrics_provider}::"MetricsProvider",
    ${metric.avg_monthly_searches ?? null}::integer, ${metric.competition ?? null}::double precision,
    ${metric.low_top_of_page_bid_micros ?? null}::bigint, ${metric.high_top_of_page_bid_micros ?? null}::bigint,
    ${metric.metrics_precision ?? null}::"MetricsPrecision", ${score}::double precision, ${score_source}::"ScoreSource",
    ${now}::timestamp(3)
  )`;
}

// SQL statico dell'aggiornamento, come la scrittura dei risultati dell'estrazione (candidates.ts): nessun valore dentro
// questi frammenti, i dati entrano solo come parametri legati (updateValues e l'id del progetto).
const UPDATE_METRICS = Prisma.sql`
  UPDATE "keyword_candidates" AS k SET
    "metrics_status" = v.status, "metrics_provider" = v.provider, "avg_monthly_searches" = v.volume,
    "competition" = v.competition, "low_top_of_page_bid_micros" = v.low_bid, "high_top_of_page_bid_micros" = v.high_bid,
    "metrics_precision" = v.precision, "score" = v.score, "score_source" = v.score_source,
    "metrics_updated_at" = v.at, "updated_at" = v.at
  FROM (VALUES`;
const UPDATE_METRICS_ROWS = Prisma.sql`) AS v(id, status, provider, volume, competition, low_bid, high_bid, precision, score, score_source, at)
  WHERE k."id" = v.id AND k."project_id" =`;

/** Scrive metriche e punteggio sulle keyword del progetto (project_id nel where, CWE-639); review_status non si tocca. */
async function writeMetrics(projectId: string, values: Prisma.Sql[]): Promise<void> {
  for (let start = 0; start < values.length; start += UPDATE_CHUNK_SIZE) {
    const part = Prisma.join(values.slice(start, start + UPDATE_CHUNK_SIZE));
    await prisma.$executeRaw`${UPDATE_METRICS} ${part} ${UPDATE_METRICS_ROWS} ${projectId}`;
  }
}

/**
 * Chiede a DataForSEO i volumi delle keyword tenute del perimetro che non li hanno (stesse clausole del piano, senza il
 * volume minimo), a lotti da 1000, e li salva sulle keyword con il punteggio ricalcolato. Le keyword con volume non si
 * richiedono. Senza il diritto ai dati con licenza nessuna chiamata e PLAN_NO_LICENSED_METRICS; oltre la quota o un
 * tetto di spesa le keyword rimaste restano senza volume e l'esito ha il motivo.
 */
export async function fillPerimeterVolumes(
  project: { id: string; workspace_id: string },
  settings: StrategySettings,
  context: { actor: { isRootAdmin: boolean }; jobId?: string }
): Promise<PerimeterVolumesOutcome> {
  const outcome: PerimeterVolumesOutcome = { requested: 0, filled: 0, costUsd: 0, requests: 0 };
  if (!(await canUseLicensedMetrics(context.actor, project.workspace_id))) {
    return { ...outcome, notice: "PLAN_NO_LICENSED_METRICS" };
  }
  const candidates = await prisma.keywordCandidate.findMany({
    where: { AND: [perimeterWhere(project.id, settings, { minVolume: false }), { avg_monthly_searches: null }] },
    select: CANDIDATE_SELECT,
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { id: "asc" }],
  });
  const groups = await groupByTarget(project.id, candidates);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  let granted = await grantedKeywords(project.workspace_id, context.actor, total);
  if (granted < total) {
    outcome.notice = "LICENSED_METRICS_QUOTA_EXCEEDED";
  }

  const provider = new DataForSeoMetricsProvider();
  const now = new Date();
  const values: Prisma.Sql[] = [];
  for (const group of groups) {
    const items = group.items.slice(0, granted);
    granted -= items.length;
    if (items.length === 0 || BUDGET_NOTICES.has(outcome.notice as MetricsNotice)) {
      continue;
    }
    const enriched = await provider.enrichKeywords(items, {
      languageCode: group.languageCode,
      countryCode: group.countryCode,
      projectId: project.id,
      jobId: context.jobId,
    });
    outcome.requested += items.length;
    outcome.costUsd += enriched.costUsd ?? 0;
    outcome.requests += enriched.requests ?? 0;
    outcome.notice = enriched.notice ?? outcome.notice;
    outcome.providerError = enriched.providerError ?? outcome.providerError;
    for (const [canonical, metric] of enriched.metrics) {
      if (typeof metric.avg_monthly_searches !== "number") {
        continue;
      }
      for (const { candidate, scoringProfile } of group.rows.get(canonical) ?? []) {
        values.push(updateValues(candidate, metric, scoringProfile, now));
      }
    }
  }
  await writeMetrics(project.id, values);
  return { ...outcome, filled: values.length, costUsd: Math.round(outcome.costUsd * 10_000) / 10_000 };
}
