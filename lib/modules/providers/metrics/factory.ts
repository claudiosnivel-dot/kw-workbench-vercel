import { MetricsProvider } from "@/lib/generated/prisma/enums";
import { DataForSeoMetricsProvider } from "@/lib/modules/providers/metrics/dataforseo";
import { MockMetricsProvider } from "@/lib/modules/providers/metrics/mock";
import { NoMetricsProvider } from "@/lib/modules/providers/metrics/no-metrics";
import type { MetricsProvider as MetricsProviderContract } from "@/lib/modules/providers/metrics/types";

export function createMetricsProvider(provider: MetricsProvider): MetricsProviderContract {
  if (provider === "MOCK") {
    return new MockMetricsProvider();
  }

  if (provider === "DATAFORSEO") {
    return new DataForSeoMetricsProvider();
  }

  return new NoMetricsProvider();
}
