import { MetricsContext, MetricsItem, MetricsProvider, missingOutcome } from "@/lib/modules/providers/metrics/types";

export class NoMetricsProvider implements MetricsProvider {
  readonly id = "NONE" as const;

  async enrichKeywords(items: MetricsItem[], _context: MetricsContext) {
    return missingOutcome(items, this.id);
  }
}
