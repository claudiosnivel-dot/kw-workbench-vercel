import type { MetricsProvider as MetricsProviderId } from "@/lib/generated/prisma/enums";
import { MetricsContext, MetricsItem, MetricsProvider, missingOutcome } from "@/lib/modules/providers/metrics/types";

/** Provider spento: nessuna chiamata di rete, ogni keyword resta senza metriche con motivo PROVIDER_DISABLED. */
export class DisabledMetricsProvider implements MetricsProvider {
  constructor(readonly id: MetricsProviderId) {}

  async enrichKeywords(items: MetricsItem[], _context: MetricsContext) {
    return missingOutcome(items, this.id, "PROVIDER_DISABLED");
  }
}
