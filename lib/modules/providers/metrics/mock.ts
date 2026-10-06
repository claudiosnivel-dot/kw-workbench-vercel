import {
  KeywordMetric,
  MetricsContext,
  MetricsItem,
  MetricsOutcome,
  MetricsProvider,
} from "@/lib/modules/providers/metrics/types";

function hashWord(word: string): number {
  return Array.from(word).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}

export class MockMetricsProvider implements MetricsProvider {
  readonly id = "MOCK" as const;

  async enrichKeywords(items: MetricsItem[], _context: MetricsContext): Promise<MetricsOutcome> {
    const map = new Map<string, KeywordMetric>();

    // Valori derivati dal canonical: stessi numeri del golden master di T-106.
    for (const { canonical: keyword } of items) {
      const hash = Math.abs(hashWord(keyword));
      const volume = 10 + (hash % 7500);
      const competition = Number(((hash % 100) / 100).toFixed(2));
      const lowBid = BigInt((50_000 + (hash % 1_500_000)) * 1_000);
      const highBid = lowBid + BigInt((100_000 + (hash % 2_000_000)) * 1_000);

      map.set(keyword, {
        keyword,
        metrics_status: "mock",
        metrics_provider: this.id,
        metrics_precision: "exact",
        avg_monthly_searches: volume,
        competition,
        low_top_of_page_bid_micros: lowBid,
        high_top_of_page_bid_micros: highBid,
      });
    }

    return { metrics: map };
  }
}
