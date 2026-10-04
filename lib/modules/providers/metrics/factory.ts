import { MetricsProvider } from "@prisma/client";
import { DisabledMetricsProvider } from "@/lib/modules/providers/metrics/disabled";
import { MockMetricsProvider } from "@/lib/modules/providers/metrics/mock";
import { NoMetricsProvider } from "@/lib/modules/providers/metrics/no-metrics";
import { MetricsProviderClient } from "@/lib/modules/providers/metrics/types";

export function createMetricsProvider(provider: MetricsProvider): MetricsProviderClient {
  if (provider === "MOCK") {
    return new MockMetricsProvider();
  }

  if (provider === "GOOGLE_KEYWORD_PLANNER") {
    // API Google Ads dismessa e non usabile per le metriche (D-09): nessuna chiamata, volumi assenti dichiarati.
    return new DisabledMetricsProvider(provider);
  }

  return new NoMetricsProvider();
}
