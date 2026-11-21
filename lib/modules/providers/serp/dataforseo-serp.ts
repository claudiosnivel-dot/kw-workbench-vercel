import { getIntEnv } from "@/lib/env";
import { mapWithConcurrency } from "@/lib/modules/pipeline/candidates";
import { resolveDataForSeoTarget } from "@/lib/modules/providers/metrics/dataforseo-targets";
import { type BudgetNotice, reserveProviderRequest, settleProviderRequest } from "@/lib/modules/providers/metrics/metrics-ledger";
import type { MetricsContext, MetricsItem, MetricsNotice, MetricsProviderError } from "@/lib/modules/providers/metrics/types";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

// Primi 10 risultati organici di Google con la SERP API di DataForSEO (T-6101, D-57), in coda priority: i task si
// inviano con task_post e si raccolgono quando compaiono in tasks_ready, con task_get/regular. Fatti della documentazione
// (endpoint, 100 task per chiamata, priority 2, prezzi, codici 40601/40602) in docs/METRICS-PROVIDERS.md.
// Dal 2026-08-26 Google mostra i risultati dietro link di reindirizzamento google.com/goto con un codice proprio per
// ricerca: i task chiedono resolve_goto_urls (falso per priority 2 se non si chiede) e i link rimasti non si salvano,
// perché non corrispondono mai fra due keyword (T-6504).

const API_BASE = "https://api.dataforseo.com/v3/serp/google/organic";
export const DATAFORSEO_SERP_TASK_POST_URL = `${API_BASE}/task_post`;
export const DATAFORSEO_SERP_TASKS_READY_URL = `${API_BASE}/tasks_ready`;
export const DATAFORSEO_SERP_TASK_GET_URL = `${API_BASE}/task_get/regular`;
/** Task per chiamata a task_post: oltre, DataForSEO rifiuta la chiamata con 40006. */
export const SERP_TASKS_PER_CALL = 100;
/** Prezzo di una SERP (10 risultati) nella coda priority, letto il 2026-11-13: la stima della prenotazione (T-903). */
export const SERP_PRIORITY_COST_USD = 0.0012;
/** Risultati organici salvati per keyword: una pagina di Google, il prezzo di una SERP. */
export const SERP_MAX_URLS = 10;
/** Lunghezza massima di titolo e descrizione salvati di un risultato (T-7401). */
const SERP_TEXT_MAX_LENGTH = 300;

const PRIORITY_HIGH = 2;
const STATUS_OK = 20000;
const STATUS_TASK_CREATED = 20100;
// 40601 task ricevuto e non ancora in coda, 40602 task in coda: si riprova alla raccolta successiva.
const NOT_READY_CODES = new Set([40601, 40602]);
// Raccolte in parallelo: DataForSEO ammette al massimo 30 richieste simultanee per account (40209).
const COLLECT_CONCURRENCY = 10;
const MAX_URL_LENGTH = 2048;

/**
 * true per un link di reindirizzamento di Google (https://google.com/goto?url=..., anche con www o un altro dominio di
 * Google): non dice la pagina di arrivo e ha un codice diverso a ogni ricerca (T-6504).
 */
export function isGoogleGotoUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(url.hostname) && url.pathname === "/goto";
}

/** Parametri di tracciamento che Google aggiunge agli URL dei risultati e che cambiano da una ricerca all'altra. */
const TRACKING_PARAMS = ["srsltid"];

/**
 * URL di un risultato senza i parametri di tracciamento di Google (srsltid), così la stessa pagina trovata da due
 * keyword ha lo stesso URL (T-6504); un testo che non è un URL resta com'è.
 */
export function withoutTrackingParams(value: string): string {
  if (!TRACKING_PARAMS.some((param) => value.includes(`${param}=`))) return value;
  try {
    const url = new URL(value);
    for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
    return url.toString();
  } catch {
    return value;
  }
}

/** Un task inviato: la forma canonica della keyword e l'id del task restituito da DataForSEO. */
export type SerpTask = { canonical: string; taskId: string };

/** Risultato organico salvato in keyword_serps.results (T-7401): testo di terzi, null dove manca. */
export type SerpResult = { url: string; title: string | null; description: string | null };

/** Motivo per cui i risultati non sono stati chiesti o raccolti (stessi codici dei volumi). */
export type SerpNotice = Extract<
  MetricsNotice,
  "PROVIDER_NOT_CONFIGURED" | "LOCATION_UNSUPPORTED" | "LANGUAGE_UNSUPPORTED" | BudgetNotice | "PLAN_NO_LICENSED_METRICS"
>;

export type SerpPostOutcome = {
  tasks: SerpTask[];
  notice?: SerpNotice;
  /** Ultima chiamata non riuscita: status HTTP e codice di DataForSEO, null per un timeout o un errore di rete. */
  providerError?: MetricsProviderError;
  costUsd: number;
  requests: number;
};

export type SerpCollectOutcome = {
  /** Forme canoniche con i risultati salvati in keyword_serps. */
  saved: string[];
  /** Task non ancora pronti: si raccolgono alla prossima chiamata. */
  pending: SerpTask[];
  /** Forme canoniche dei task non riusciti: restano senza risultati. */
  failed: string[];
  notice?: SerpNotice;
  providerError?: MetricsProviderError;
};

type SerpItem = { type?: string; rank_absolute?: number; url?: string | null; title?: string | null; description?: string | null };
type ApiTask<R> = { id?: string; status_code?: number; cost?: number; result?: R[] | null };
type ApiResponse<R> = { status_code?: number; cost?: number; tasks?: ApiTask<R>[] };
type Call<R> = { ok: boolean; httpStatus: number | null; body: ApiResponse<R> };

/** Una chiamata all'API con il timeout dei volumi; un timeout o un errore di rete danno httpStatus null. */
async function callApi<R>(url: string, authorization: string, body?: unknown): Promise<Call<R>> {
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(getIntEnv("DATAFORSEO_TIMEOUT_MS")),
    });
    const parsed = (await response.json().catch(() => ({}))) as ApiResponse<R>;
    return { ok: response.ok && parsed.status_code === STATUS_OK, httpStatus: response.status, body: parsed };
  } catch {
    return { ok: false, httpStatus: null, body: {} };
  }
}

function errorOf(call: Call<unknown>): MetricsProviderError {
  return { httpStatus: call.httpStatus, code: typeof call.body.status_code === "number" ? call.body.status_code : null };
}

const CONTROL_CHARACTERS = /\p{Cc}/gu;
const LONE_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

/**
 * Titolo o descrizione di un risultato come testo semplice (T-7401): i caratteri di controllo diventano spazi (Postgres
 * non salva \u0000 nei JSON), gli spazi si uniscono e il testo si taglia a 300 caratteri senza spezzare una coppia
 * surrogata; vuoto o mancante è null.
 */
function serpText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  return text.length === 0 ? null : text.slice(0, SERP_TEXT_MAX_LENGTH).replace(LONE_HIGH_SURROGATE, "").trimEnd();
}

/**
 * Soli risultati organic nell'ordine di rank_absolute, al massimo 10, senza i link goto di Google rimasti e senza i
 * parametri di tracciamento (T-6504), con titolo e descrizione (T-7401): dati esterni salvati come testo.
 */
function organicResults(items: SerpItem[]): SerpResult[] {
  return items
    .filter(
      (item) =>
        item.type === "organic" &&
        typeof item.url === "string" &&
        item.url.length > 0 &&
        item.url.length <= MAX_URL_LENGTH &&
        !isGoogleGotoUrl(item.url)
    )
    .sort((left, right) => (left.rank_absolute ?? Number.MAX_SAFE_INTEGER) - (right.rank_absolute ?? Number.MAX_SAFE_INTEGER))
    .slice(0, SERP_MAX_URLS)
    .map((item) => ({ url: withoutTrackingParams(item.url as string), title: serpText(item.title), description: serpText(item.description) }));
}

/**
 * Invia i task delle keyword a task_post in coda priority (priority 2, depth 10, resolve_goto_urls, T-6504), lingua e paese come per i volumi, a
 * lotti da 100. Ogni chiamata è prenotata sui tetti di spesa (T-903) con il prezzo della coda priority per il numero di
 * task e chiusa con il costo restituito; oltre un tetto non parte e le keyword rimaste restano senza task. Senza
 * credenziali nessuna chiamata e PROVIDER_NOT_CONFIGURED. Nei log solo conteggi, codici e costo (CWE-532).
 */
export async function postSerpTasks(items: MetricsItem[], context: MetricsContext): Promise<SerpPostOutcome> {
  const outcome: SerpPostOutcome = { tasks: [], costUsd: 0, requests: 0 };
  if (items.length === 0) {
    return outcome;
  }
  const request = resolveDataForSeoTarget(context);
  if ("notice" in request) {
    return { ...outcome, notice: request.notice };
  }
  const runRequestIds: string[] = [];
  let costUsd = 0;

  for (let start = 0; start < items.length; start += SERP_TASKS_PER_CALL) {
    const batch = items.slice(start, start + SERP_TASKS_PER_CALL);
    const reservation = await reserveProviderRequest({
      provider: "DATAFORSEO",
      projectId: context.projectId,
      jobId: context.jobId,
      keywordCount: batch.length,
      runRequestIds,
      estimatedCostUsd: batch.length * SERP_PRIORITY_COST_USD,
    });
    if (!reservation.ok) {
      outcome.notice = reservation.notice;
      break;
    }
    runRequestIds.push(reservation.id);
    const call = await callApi<never>(
      DATAFORSEO_SERP_TASK_POST_URL,
      request.authorization,
      batch.map((item) => ({ keyword: item.displayKeyword, ...request.target, priority: PRIORITY_HIGH, depth: SERP_MAX_URLS, resolve_goto_urls: true }))
    );
    const cost = typeof call.body.cost === "number" ? call.body.cost : 0;
    await settleProviderRequest(reservation.id, cost, call.ok, errorOf(call).code);
    costUsd += cost;
    outcome.requests += 1;

    // I task tornano nell'ordine dell'invio; si tengono solo quelli creati (20100).
    const created = (call.body.tasks ?? []).flatMap((task, index) =>
      task.status_code === STATUS_TASK_CREATED && typeof task.id === "string" && batch[index]
        ? [{ canonical: batch[index].canonical, taskId: task.id }]
        : []
    );
    outcome.tasks.push(...created);
    logger.info("dataforseo_serp_post", {
      status: call.httpStatus,
      code: errorOf(call).code,
      tasks: batch.length,
      created: created.length,
      costUsd: cost,
    });
    if (!call.ok || created.length < batch.length) {
      outcome.providerError = errorOf(call);
    }
  }
  outcome.costUsd = Math.round(costUsd * 10_000) / 10_000;
  return outcome;
}

/** Id dei task pronti e non ancora raccolti dell'account (tasks_ready, fino a 1000 per chiamata), o l'errore della chiamata. */
async function readyTaskIds(authorization: string): Promise<{ ids: Set<string> } | { error: MetricsProviderError }> {
  const call = await callApi<{ id?: string }>(DATAFORSEO_SERP_TASKS_READY_URL, authorization);
  if (!call.ok) {
    return { error: errorOf(call) };
  }
  const results = call.body.tasks?.flatMap((task) => task.result ?? []) ?? [];
  return { ids: new Set(results.flatMap((result) => (typeof result.id === "string" ? [result.id] : []))) };
}

type Collected = { kind: "saved" | "pending" | "failed"; task: SerpTask; error?: MetricsProviderError };

/**
 * Raccoglie i task pronti (tasks_ready, poi task_get/regular per ognuno dei richiesti) e salva in keyword_serps gli URL
 * organic con titolo e descrizione (T-7401), con fetched_at aggiornato; restituisce i task ancora non pronti e quelli
 * non riusciti. Leggere i risultati non costa (la spesa è all'invio), quindi le chiamate non passano dal registro.
 */
export async function collectSerpTasks(tasks: SerpTask[], context: MetricsContext): Promise<SerpCollectOutcome> {
  const outcome: SerpCollectOutcome = { saved: [], pending: [], failed: [] };
  // Nessun task: nessuna chiamata. Senza credenziali o target i task restano in attesa con il motivo.
  const request = tasks.length > 0 ? resolveDataForSeoTarget(context) : null;
  if (request === null || "notice" in request) {
    return request === null ? outcome : { ...outcome, pending: tasks, notice: request.notice };
  }
  const ready = await readyTaskIds(request.authorization);
  if ("error" in ready) {
    return { ...outcome, pending: tasks, providerError: ready.error };
  }

  const languageCode = context.languageCode.toLowerCase();
  const countryCode = context.countryCode.toUpperCase();
  const collected = await mapWithConcurrency(tasks, COLLECT_CONCURRENCY, async (task): Promise<Collected> => {
    if (!ready.ids.has(task.taskId)) {
      return { kind: "pending", task };
    }
    const call = await callApi<{ items?: SerpItem[] | null }>(
      `${DATAFORSEO_SERP_TASK_GET_URL}/${encodeURIComponent(task.taskId)}`,
      request.authorization
    );
    const apiTask = call.body.tasks?.[0];
    if (apiTask?.status_code !== undefined && NOT_READY_CODES.has(apiTask.status_code)) {
      return { kind: "pending", task };
    }
    if (!call.ok || apiTask?.status_code !== STATUS_OK) {
      return { kind: "failed", task, error: { httpStatus: call.httpStatus, code: apiTask?.status_code ?? errorOf(call).code } };
    }
    // urls resta l'elenco che legge il motore del piano; results ha gli stessi risultati con titolo e descrizione.
    const results = organicResults(apiTask.result?.flatMap((result) => result.items ?? []) ?? []);
    const urls = results.map((result) => result.url);
    const key = { language_code: languageCode, country_code: countryCode, canonical_keyword: task.canonical };
    await prisma.keywordSerp.upsert({
      where: { language_code_country_code_canonical_keyword: key },
      create: { ...key, urls, results },
      update: { urls, results, fetched_at: new Date() },
    });
    return { kind: "saved", task };
  });

  for (const item of collected) {
    if (item.kind === "saved") outcome.saved.push(item.task.canonical);
    else if (item.kind === "pending") outcome.pending.push(item.task);
    else {
      outcome.failed.push(item.task.canonical);
      outcome.providerError = item.error;
    }
  }
  logger.info("dataforseo_serp_collect", {
    requested: tasks.length,
    saved: outcome.saved.length,
    pending: outcome.pending.length,
    failed: outcome.failed.length,
  });
  return outcome;
}
