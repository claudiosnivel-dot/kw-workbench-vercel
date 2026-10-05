import type {
  MetricsPrecision,
  MetricsProvider as MetricsProviderId,
  MetricsStatus,
} from "@/lib/generated/prisma/enums";

/** Metriche di un canonical; `keyword` è il canonical con cui la mappa le indicizza. */
export type KeywordMetric = {
  keyword: string;
  metrics_status: MetricsStatus;
  metrics_provider: MetricsProviderId;
  metrics_precision?: MetricsPrecision;
  avg_monthly_searches?: number;
  competition?: number;
  low_top_of_page_bid_micros?: bigint;
  high_top_of_page_bid_micros?: bigint;
};

export type MetricsContext = {
  languageCode: string;
  countryCode: string;
};

/** Una keyword da arricchire: la forma di visualizzazione (con accenti) e il canonical che indicizza il risultato. */
export type MetricsItem = {
  displayKeyword: string;
  canonical: string;
};

/** Motivo dell'assenza dei volumi, riportato dall'estrazione in result.metricsNotice del job. */
export type MetricsNotice =
  | "PROVIDER_DISABLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "LOCATION_UNSUPPORTED"
  | "LANGUAGE_UNSUPPORTED";

export type MetricsOutcome = {
  metrics: Map<string, KeywordMetric>;
  notice?: MetricsNotice;
  costUsd?: number;
  /** Richieste inviate al fornitore, tentativi compresi. */
  requests?: number;
  /** Risultati che il fornitore ha restituito per la forma corretta della keyword (campo spell). */
  spellCorrected?: number;
  /** Keyword escluse prima della chiamata, per motivo. */
  skipped?: Record<string, number>;
};

/** Campi dell'esito che l'estrazione aggiunge al result del job (solo quelli presenti). */
export function toMetricsResult(outcome: MetricsOutcome) {
  return {
    ...(outcome.notice ? { metricsNotice: outcome.notice } : {}),
    ...(outcome.costUsd !== undefined ? { metricsCostUsd: outcome.costUsd } : {}),
    ...(outcome.requests !== undefined ? { metricsRequests: outcome.requests } : {}),
    ...(outcome.spellCorrected !== undefined ? { metricsSpellCorrected: outcome.spellCorrected } : {}),
    ...(outcome.skipped !== undefined ? { metricsSkipped: outcome.skipped } : {}),
  };
}

/** Contratto unico dei provider di metriche (T-901). */
export interface MetricsProvider {
  readonly id: MetricsProviderId;
  enrichKeywords(items: MetricsItem[], context: MetricsContext): Promise<MetricsOutcome>;
}

export function buildMissingMetrics(
  canonicals: string[],
  provider: MetricsProviderId,
  status: MetricsStatus = "missing"
): Map<string, KeywordMetric> {
  return new Map(
    canonicals.map((keyword) => [
      keyword,
      {
        keyword,
        metrics_status: status,
        metrics_provider: provider,
      },
    ])
  );
}
