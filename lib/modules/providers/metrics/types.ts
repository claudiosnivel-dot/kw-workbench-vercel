import type {
  MetricsPrecision,
  MetricsProvider as MetricsProviderId,
  MetricsStatus,
} from "@/lib/generated/prisma/enums";

/** Metriche di un canonical; `keyword` è il canonical con cui la mappa le indicizza. */
export type KeywordMetric = {
  keyword: string;
  metrics_status: MetricsStatus;
  metrics_provider: MetricsProviderId;
  metrics_precision?: MetricsPrecision;
  avg_monthly_searches?: number;
  competition?: number;
  low_top_of_page_bid_micros?: bigint;
  high_top_of_page_bid_micros?: bigint;
};

export type MetricsContext = {
  languageCode: string;
  countryCode: string;
};

/** Una keyword da arricchire: la forma di visualizzazione (con accenti) e il canonical che indicizza il risultato. */
export type MetricsItem = {
  displayKeyword: string;
  canonical: string;
};

/** Motivo dell'assenza dei volumi, riportato dall'estrazione in result.metricsNotice del job. */
export type MetricsNotice = "PROVIDER_DISABLED";

export type MetricsOutcome = {
  metrics: Map<string, KeywordMetric>;
  notice?: MetricsNotice;
  costUsd?: number;
};

/** Contratto unico dei provider di metriche (T-901). */
export interface MetricsProvider {
  readonly id: MetricsProviderId;
  enrichKeywords(items: MetricsItem[], context: MetricsContext): Promise<MetricsOutcome>;
}

export function buildMissingMetrics(
  canonicals: string[],
  provider: MetricsProviderId,
  status: MetricsStatus = "missing"
): Map<string, KeywordMetric> {
  return new Map(
    canonicals.map((keyword) => [
      keyword,
      {
        keyword,
        metrics_status: status,
        metrics_provider: provider,
      },
    ])
  );
}
