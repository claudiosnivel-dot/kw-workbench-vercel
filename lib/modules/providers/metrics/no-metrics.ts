import { MetricsContext, MetricsItem, MetricsOutcome, MetricsProvider } from "@/lib/modules/providers/metrics/types";
import { buildMissingMetrics } from "@/lib/modules/providers/metrics/types";

export class NoMetricsProvider implements MetricsProvider {
  readonly id = "NONE" as const;

  async enrichKeywords(items: MetricsItem[], _context: MetricsContext): Promise<MetricsOutcome> {
    return {
      metrics: buildMissingMetrics(
        items.map((item) => item.canonical),
        this.id,
        "missing"
      ),
    };
  }
}
