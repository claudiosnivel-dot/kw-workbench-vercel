import { getDataForSeoCredentials, getIntEnv } from "@/lib/env";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { dataForSeoSkipReason } from "@/lib/modules/providers/metrics/dataforseo-keywords";
import { toDataForSeoLanguageCode, toDataForSeoLocationCode } from "@/lib/modules/providers/metrics/dataforseo-targets";
import {
  type BudgetNotice,
  recentProviderRequestTimes,
  reserveProviderRequest,
  settleProviderRequest,
} from "@/lib/modules/providers/metrics/metrics-ledger";
import {
  KeywordMetric,
  MetricsContext,
  MetricsItem,
  MetricsOutcome,
  MetricsProvider,
  missingOutcome,
} from "@/lib/modules/providers/metrics/types";
import { logger } from "@/lib/observability/logger";

/** Endpoint live di DataForSEO per i volumi Google Ads (D-30): un task per richiesta. */
export const DATAFORSEO_SEARCH_VOLUME_URL =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
/** Keyword per richiesta: limite documentato dell'endpoint, il prezzo è per richiesta. */
export const DATAFORSEO_BATCH_SIZE = 1000;

const STATUS_OK = 20000;
// Limite documentato per account sugli endpoint live Google Ads: 12 richieste al minuto (T-909).
const LIMIT_REQUESTS = 12;
const LIMIT_WINDOW_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
// Codici interni di DataForSEO ripetibili (https://docs.dataforseo.com/v3/appendix/errors, 2026-10-06): 40202 limite
// al minuto superato, 40209 troppe richieste simultanee, 5xxxx errori del server; gli altri 4xxxx no (credenziali,
// credito, campi non validi).
const RETRYABLE_TASK_CODES = new Set([40202, 40209]);
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

/** Esito di un tentativo: status HTTP se la risposta non è 2xx, altrimenti status_code del task. */
type AttemptResult = {
  status: number | "timeout" | "network";
  taskId?: string;
  costUsd: number;
  results: SearchVolumeResult[];
};

// Istanti degli invii di questa istanza negli ultimi 60 secondi.
let sentAt: number[] = [];

export function resetDataForSeoLimiterForTests(): void {
  sentAt = [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attende finché l'invio non porta oltre 12 richieste in una finestra di 60 secondi, poi lo registra. Conta gli
 * invii di questa istanza e le righe del registro degli ultimi 60 secondi (tutte le istanze, T-903), e usa il
 * conteggio più alto.
 */
async function acquireSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    sentAt = sentAt.filter((time) => now - time < LIMIT_WINDOW_MS);
    const shared = await recentProviderRequestTimes("DATAFORSEO", new Date(now - LIMIT_WINDOW_MS));
    const window = shared.length > sentAt.length ? shared : sentAt;
    if (window.length < LIMIT_REQUESTS) {
      sentAt.push(now);
      return;
    }
    await sleep(Math.max(1, window[window.length - LIMIT_REQUESTS] + LIMIT_WINDOW_MS - now));
  }
}

function isRetryable(status: AttemptResult["status"]): boolean {
  if (status === "timeout") {
    return true;
  }
  if (status === "network") {
    return false;
  }
  return (
    status === 429 ||
    (status >= 500 && status < 600) ||
    RETRYABLE_TASK_CODES.has(status) ||
    (status >= 50000 && status < 60000)
  );
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

async function postOnce(
  keywords: string[],
  target: { location_code: number; language_code: string },
  authorization: string
): Promise<AttemptResult> {
  let response: Response;
  try {
    response = await fetch(DATAFORSEO_SEARCH_VOLUME_URL, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      // location_code sempre presente: senza, DataForSEO restituirebbe volumi mondiali.
      body: JSON.stringify([{ keywords, ...target, search_partners: false }]),
      signal: AbortSignal.timeout(getIntEnv("DATAFORSEO_TIMEOUT_MS")),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { status: timedOut ? "timeout" : "network", costUsd: 0, results: [] };
  }
  const body = (await response.json().catch(() => ({}))) as SearchVolumeResponse;
  const task = body.tasks?.[0];
  return {
    status: !response.ok ? response.status : (task?.status_code ?? body.status_code ?? 0),
    taskId: task?.id,
    costUsd: typeof body.cost === "number" ? body.cost : 0,
    results: task?.result ?? [],
  };
}

/** Estrazione corrente: le sue richieste prenotate contano per il tetto per estrazione (T-903). */
type RunLedger = { projectId?: string; jobId?: string; requestIds: string[] };

type BatchOutcome = { attempt?: AttemptResult; attempts: number; costUsd: number; blocked?: BudgetNotice };

/**
 * Invia un lotto con al massimo DATAFORSEO_MAX_ATTEMPTS tentativi: si ripete solo su 429, 5xx, timeout e codici
 * interni ripetibili, con backoff esponenziale e jitter. Ogni tentativo passa dal limitatore e dalla prenotazione
 * sui tetti di spesa (T-903): oltre un tetto non parte e il lotto resta senza volumi. I log riportano status, id
 * del task e costo, mai le credenziali (CWE-532).
 */
async function sendBatch(
  keywords: string[],
  target: { location_code: number; language_code: string },
  authorization: string,
  run: RunLedger
): Promise<BatchOutcome> {
  const maxAttempts = getIntEnv("DATAFORSEO_MAX_ATTEMPTS");
  let costUsd = 0;
  for (let attempts = 1; ; attempts += 1) {
    await acquireSlot();
    const reservation = await reserveProviderRequest({
      provider: "DATAFORSEO",
      projectId: run.projectId,
      jobId: run.jobId,
      keywordCount: keywords.length,
      runRequestIds: run.requestIds,
    });
    if (!reservation.ok) {
      return { attempts: attempts - 1, costUsd, blocked: reservation.notice };
    }
    run.requestIds.push(reservation.id);
    const attempt = await postOnce(keywords, target, authorization);
    await settleProviderRequest(reservation.id, attempt.costUsd, attempt.status === STATUS_OK);
    costUsd += attempt.costUsd;
    logger.info("dataforseo_request", {
      status: attempt.status,
      taskId: attempt.taskId,
      costUsd: attempt.costUsd,
      keywords: keywords.length,
      attempt: attempts,
    });
    if (attempt.status === STATUS_OK || attempts >= maxAttempts || !isRetryable(attempt.status)) {
      return { attempt, attempts, costUsd };
    }
    const backoff = BACKOFF_BASE_MS * 2 ** (attempts - 1);
    await sleep(backoff + Math.random() * backoff);
  }
}

/** Provider con licenza DataForSEO (T-902, D-30): credenziali solo da env, nessuna chiamata senza location. */
export class DataForSeoMetricsProvider implements MetricsProvider {
  readonly id = "DATAFORSEO" as const;

  async enrichKeywords(items: MetricsItem[], context: MetricsContext): Promise<MetricsOutcome> {
    const credentials = getDataForSeoCredentials();
    if (!credentials) {
      return missingOutcome(items, this.id, "PROVIDER_NOT_CONFIGURED");
    }
    const locationCode = toDataForSeoLocationCode(context.countryCode);
    if (locationCode === null) {
      return missingOutcome(items, this.id, "LOCATION_UNSUPPORTED");
    }
    const languageCode = toDataForSeoLanguageCode(context.languageCode);
    if (languageCode === null) {
      return missingOutcome(items, this.id, "LANGUAGE_UNSUPPORTED");
    }
    const { metrics } = missingOutcome(items, this.id);

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
    const run: RunLedger = { projectId: context.projectId, jobId: context.jobId, requestIds: [] };
    let notice: BudgetNotice | undefined;
    let costUsd = 0;
    let requests = 0;
    let spellCorrected = 0;

    const batches = Array.from({ length: Math.ceil(accepted.length / DATAFORSEO_BATCH_SIZE) }, (_, index) =>
      accepted.slice(index * DATAFORSEO_BATCH_SIZE, (index + 1) * DATAFORSEO_BATCH_SIZE)
    );
    for (const batch of batches) {
      const requested = new Set(batch.map((item) => item.canonical));
      const sent = await sendBatch(
        batch.map((item) => item.displayKeyword),
        target,
        authorization,
        run
      );
      requests += sent.attempts;
      costUsd += sent.costUsd;

      if (!sent.attempt || sent.blocked) {
        // Tetto di spesa raggiunto: questo lotto e i successivi restano senza volumi.
        notice = sent.blocked;
        break;
      }

      if (sent.attempt.status !== STATUS_OK) {
        // Lotto non riuscito: nessuna metrica inventata, gli altri lotti proseguono.
        logger.warn("dataforseo_batch_failed", {
          status: sent.attempt.status,
          taskId: sent.attempt.taskId,
          attempts: sent.attempts,
        });
        for (const canonical of requested) {
          metrics.set(canonical, { keyword: canonical, metrics_status: "failed", metrics_provider: this.id });
        }
        continue;
      }

      for (const result of sent.attempt.results) {
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
    }

    return {
      metrics,
      ...(notice ? { notice } : {}),
      costUsd: Math.round(costUsd * 10_000) / 10_000,
      requests,
      spellCorrected,
      ...(Object.keys(skipped).length > 0 ? { skipped } : {}),
    };
  }
}
