import { MetricsProvider } from "@prisma/client";
import { GoogleKeywordPlannerMetricsProvider } from "@/lib/modules/providers/metrics/google-keyword-planner";
import { MockMetricsProvider } from "@/lib/modules/providers/metrics/mock";
import { NoMetricsProvider } from "@/lib/modules/providers/metrics/no-metrics";
import { MetricsProviderClient } from "@/lib/modules/providers/metrics/types";

export function createMetricsProvider(provider: MetricsProvider): MetricsProviderClient {
  if (provider === "MOCK") {
    return new MockMetricsProvider();
  }

  if (provider === "GOOGLE_KEYWORD_PLANNER") {
    return new GoogleKeywordPlannerMetricsProvider();
  }

  return new NoMetricsProvider();
}
