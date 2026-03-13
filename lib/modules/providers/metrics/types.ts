import { MetricsProvider, MetricsStatus } from "@prisma/client";

export type KeywordMetric = {
  keyword: string;
  metrics_status: MetricsStatus;
  metrics_provider: MetricsProvider;
  avg_monthly_searches?: number;
  competition?: number;
  low_top_of_page_bid_micros?: bigint;
  high_top_of_page_bid_micros?: bigint;
};

export type MetricsContext = {
  languageCode: string;
  countryCode: string;
};

export interface MetricsProviderClient {
  readonly id: MetricsProvider;
  enrichKeywords(keywords: string[], context: MetricsContext): Promise<Map<string, KeywordMetric>>;
}

export function buildMissingMetrics(
  keywords: string[],
  provider: MetricsProvider,
  status: MetricsStatus = "missing"
): Map<string, KeywordMetric> {
  return new Map(
    keywords.map((keyword) => [
      keyword,
      {
        keyword,
        metrics_status: status,
        metrics_provider: provider,
      },
    ])
  );
}
