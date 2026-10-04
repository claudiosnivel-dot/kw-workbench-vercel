import { MetricsProvider } from "@/lib/generated/prisma/enums";
import { buildMissingMetrics, MetricsContext, MetricsProviderClient } from "@/lib/modules/providers/metrics/types";

/** Provider spento: nessuna chiamata di rete, ogni keyword resta senza metriche con motivo PROVIDER_DISABLED. */
export class DisabledMetricsProvider implements MetricsProviderClient {
  readonly disabledReason = "PROVIDER_DISABLED" as const;

  constructor(readonly id: MetricsProvider) {}

  async enrichKeywords(keywords: string[], _context: MetricsContext) {
    return buildMissingMetrics(keywords, this.id, "missing");
  }
}
