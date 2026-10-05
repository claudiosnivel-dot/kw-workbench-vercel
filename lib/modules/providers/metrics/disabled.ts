import type { MetricsProvider as MetricsProviderId } from "@/lib/generated/prisma/enums";
import {
  buildMissingMetrics,
  MetricsContext,
  MetricsItem,
  MetricsOutcome,
  MetricsProvider,
} from "@/lib/modules/providers/metrics/types";

/** Provider spento: nessuna chiamata di rete, ogni keyword resta senza metriche con motivo PROVIDER_DISABLED. */
export class DisabledMetricsProvider implements MetricsProvider {
  constructor(readonly id: MetricsProviderId) {}

  async enrichKeywords(items: MetricsItem[], _context: MetricsContext): Promise<MetricsOutcome> {
    return {
      metrics: buildMissingMetrics(
        items.map((item) => item.canonical),
        this.id,
        "missing"
      ),
      notice: "PROVIDER_DISABLED",
    };
  }
}
