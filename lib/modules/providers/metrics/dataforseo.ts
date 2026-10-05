import { getDataForSeoCredentials } from "@/lib/env";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { dataForSeoSkipReason } from "@/lib/modules/providers/metrics/dataforseo-keywords";
import { toDataForSeoLanguageCode, toDataForSeoLocationCode } from "@/lib/modules/providers/metrics/dataforseo-targets";
import {
  buildMissingMetrics,
  KeywordMetric,
  MetricsContext,
  MetricsItem,
  MetricsOutcome,
  MetricsProvider,
} from "@/lib/modules/providers/metrics/types";
import { logger } from "@/lib/observability/logger";

/** Endpoint live di DataForSEO per i volumi Google Ads (D-30): un task per richiesta. */
export const DATAFORSEO_SEARCH_VOLUME_URL =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
/** Keyword per richiesta: limite documentato dell'endpoint, il prezzo è per richiesta. */
export const DATAFORSEO_BATCH_SIZE = 1000;

const STATUS_OK = 20000;
const COMPETITION_LEVELS: Record<string, number> = { HIGH: 0.8, MEDIUM: 0.5, LOW: 0.2 };

type SearchVolumeResult = {
  keyword?: string;
  spell?: string | null;
  search_volume?: number | null;
  competition?: string | null;
  competition_index?: number | null;
  low_top_of_page_bid?: number | null;
  high_top_of_page_bid?: number | null;
};

type SearchVolumeResponse = {
  status_code?: number;
  cost?: number;
  tasks?: { id?: string; status_code?: number; cost?: number; result?: SearchVolumeResult[] | null }[];
};

type BatchResponse = { results: SearchVolumeResult[]; costUsd: number };

/** Lotto non riuscito: le sue keyword restano senza volumi, gli altri lotti proseguono. */
class DataForSeoBatchError extends Error {
  constructor(
    readonly status: number,
    readonly taskId: string | undefined,
    readonly costUsd: number
  ) {
    super(`DataForSEO: lotto non riuscito (status ${status})`);
    this.name = "DataForSeoBatchError";
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

/** Offerta in micros; la doc di DataForSEO non dichiara la valuta delle offerte (indica USD solo per cpc). */
function toMicros(value: number | null | undefined): bigint | undefined {
  return typeof value === "number" && Number.isFinite(value) ? BigInt(Math.round(value * 1_000_000)) : undefined;
}

function toCompetition(result: SearchVolumeResult): number | undefined {
  if (typeof result.competition_index === "number") {
    return result.competition_index / 100;
  }
  return result.competition ? COMPETITION_LEVELS[result.competition] : undefined;
}

function toMetric(canonical: string, result: SearchVolumeResult): KeywordMetric | null {
  if (!Number.isInteger(result.search_volume)) {
    return null;
  }
  return {
    keyword: canonical,
    metrics_status: "fetched",
    metrics_provider: "DATAFORSEO",
    metrics_precision: "exact",
    avg_monthly_searches: result.search_volume as number,
    competition: toCompetition(result),
    low_top_of_page_bid_micros: toMicros(result.low_top_of_page_bid),
    high_top_of_page_bid_micros: toMicros(result.high_top_of_page_bid),
  };
}

async function postBatch(
  keywords: string[],
  target: { location_code: number; language_code: string },
  authorization: string
): Promise<BatchResponse> {
  const response = await fetch(DATAFORSEO_SEARCH_VOLUME_URL, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    // location_code sempre presente: senza, DataForSEO restituirebbe volumi mondiali.
    body: JSON.stringify([{ keywords, ...target, search_partners: false }]),
  });
  const body = (await response.json().catch(() => ({}))) as SearchVolumeResponse;
  const task = body.tasks?.[0];
  const costUsd = typeof body.cost === "number" ? body.cost : 0;
  const status = !response.ok ? response.status : (task?.status_code ?? body.status_code ?? 0);

  logger.info("dataforseo_request", { status, taskId: task?.id, costUsd, keywords: keywords.length });

  if (status !== STATUS_OK) {
    throw new DataForSeoBatchError(status, task?.id, costUsd);
  }
  return { results: task?.result ?? [], costUsd };
}

/** Provider con licenza DataForSEO (T-902, D-30): credenziali solo da env, nessuna chiamata senza location. */
export class DataForSeoMetricsProvider implements MetricsProvider {
  readonly id = "DATAFORSEO" as const;

  async enrichKeywords(items: MetricsItem[], context: MetricsContext): Promise<MetricsOutcome> {
    const metrics = buildMissingMetrics(
      items.map((item) => item.canonical),
      this.id
    );

    const credentials = getDataForSeoCredentials();
    if (!credentials) {
      return { metrics, notice: "PROVIDER_NOT_CONFIGURED" };
    }
    const locationCode = toDataForSeoLocationCode(context.countryCode);
    if (locationCode === null) {
      return { metrics, notice: "LOCATION_UNSUPPORTED" };
    }
    const languageCode = toDataForSeoLanguageCode(context.languageCode);
    if (languageCode === null) {
      return { metrics, notice: "LANGUAGE_UNSUPPORTED" };
    }

    const skipped: Record<string, number> = {};
    const accepted: MetricsItem[] = [];
    for (const item of items) {
      const reason = dataForSeoSkipReason(item.displayKeyword);
      if (reason) {
        skipped[reason] = (skipped[reason] ?? 0) + 1;
      } else {
        accepted.push(item);
      }
    }

    const authorization = `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`;
    const target = { location_code: locationCode, language_code: languageCode };
    let costUsd = 0;
    let requests = 0;
    let spellCorrected = 0;

    for (const batch of chunk(accepted, DATAFORSEO_BATCH_SIZE)) {
      const requested = new Set(batch.map((item) => item.canonical));
      requests += 1;
      try {
        const response = await postBatch(
          batch.map((item) => item.displayKeyword),
          target,
          authorization
        );
        costUsd += response.costUsd;
        for (const result of response.results) {
          // Il risultato torna in minuscolo: si ricollega al canonical richiesto con la stessa regola di T-702.
          const canonical = canonicalizeKeyword(result.keyword ?? "", context.languageCode);
          const metric = requested.has(canonical) ? toMetric(canonical, result) : null;
          if (metric) {
            metrics.set(canonical, metric);
          }
          if (result.spell) {
            spellCorrected += 1;
          }
        }
      } catch (error) {
        if (!(error instanceof DataForSeoBatchError)) {
          throw error;
        }
        costUsd += error.costUsd;
        for (const canonical of requested) {
          metrics.set(canonical, { keyword: canonical, metrics_status: "failed", metrics_provider: this.id });
        }
      }
    }

    return {
      metrics,
      costUsd: Math.round(costUsd * 10_000) / 10_000,
      requests,
      spellCorrected,
      ...(Object.keys(skipped).length > 0 ? { skipped } : {}),
    };
  }
}
