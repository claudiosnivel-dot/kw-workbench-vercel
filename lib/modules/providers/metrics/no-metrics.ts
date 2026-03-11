import { MetricsContext, MetricsProviderClient } from "@/lib/modules/providers/metrics/types";
import { buildMissingMetrics } from "@/lib/modules/providers/metrics/types";

export class NoMetricsProvider implements MetricsProviderClient {
  readonly id = "NONE" as const;

  async enrichKeywords(keywords: string[], _context: MetricsContext) {
    return buildMissingMetrics(keywords, this.id, "missing");
  }
}
