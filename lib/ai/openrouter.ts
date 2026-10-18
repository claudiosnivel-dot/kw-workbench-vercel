import { AiTitlesError } from "@/lib/ai/errors";
import type { TitlesRequest } from "@/lib/ai/titles-prompt";
import { getPublicAppUrl } from "@/lib/env";
import { AppError } from "@/lib/http/errors";

type CompletionOptions = { apiKey: string; baseUrl: string; timeoutMs: number };
type CompletionPayload = { model?: unknown; choices?: { message?: { content?: unknown } }[] };

/**
 * Esito di un tentativo verso un modello (T-3802): provider_busy è il 429 del fornitore sovraccarico, account_daily_limit
 * e account_rate_limit i 429 dei limiti dell'account sui modelli gratuiti (al giorno e al minuto), auth un 401 o 402.
 */
export type AttemptOutcome =
  | "ok"
  | "provider_busy"
  | "account_daily_limit"
  | "account_rate_limit"
  | "unavailable"
  | "timeout"
  | "invalid_response"
  | "auth";
type FailureOutcome = Exclude<AttemptOutcome, "ok" | "invalid_response" | "timeout">;
export type Attempt = { model: string; outcome: AttemptOutcome; httpStatus: number | null };

/** Tentativo non riuscito: per requestCompletion AI_TIMEOUT o AI_UNAVAILABLE, per le riserve anche esito e status. */
class AttemptError extends AiTitlesError {
  readonly outcome: FailureOutcome | "timeout";
  readonly httpStatus: number | null;

  constructor(outcome: FailureOutcome | "timeout", httpStatus: number | null, message: string) {
    super(outcome === "timeout" ? "AI_TIMEOUT" : "AI_UNAVAILABLE", message);
    this.outcome = outcome;
    this.httpStatus = httpStatus;
  }
}

// Il 429 del limite giornaliero dice «free-models-per-day»; quello al minuto «free-models-per-min».
const DAILY_LIMIT_MESSAGE = /per[-_ ]?day|daily/i;
// Il limite al minuto si azzera entro un minuto, quello giornaliero alla mezzanotte UTC.
const MINUTE_RESET_WINDOW_MS = 120_000;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** X-RateLimit-Reset in millisecondi (OpenRouter li usa; un valore in secondi si converte); null se assente. */
function resetTime(value: unknown): number | null {
  const time = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(time) || time <= 0) return null;
  return time < 1e12 ? time * 1000 : time;
}

/**
 * Esito di una risposta non riuscita di OpenRouter (T-3802): 401 e 402 auth; 429 con il fornitore nei metadati
 * dell'errore provider_busy, altrimenti un limite dell'account, giornaliero se il messaggio lo dice o se l'azzeramento è
 * lontano più di due minuti; ogni altro status unavailable. Il messaggio del fornitore serve solo a questa scelta e non
 * esce mai da qui (CWE-532).
 */
export function failureOutcome(status: number, body: unknown, headers: Headers, now: number = Date.now()): FailureOutcome {
  if (status === 401 || status === 402) return "auth";
  if (status !== 429) return "unavailable";
  const error = record(record(body).error);
  const metadata = record(error.metadata);
  if (typeof metadata.provider_name === "string" && metadata.provider_name.trim()) return "provider_busy";
  const message = typeof error.message === "string" ? error.message : "";
  const reset = resetTime(headers.get("x-ratelimit-reset") ?? record(metadata.headers)["X-RateLimit-Reset"]);
  if (DAILY_LIMIT_MESSAGE.test(message) || (reset !== null && reset - now > MINUTE_RESET_WINDOW_MS)) return "account_daily_limit";
  return "account_rate_limit";
}

async function callOpenRouter(body: TitlesRequest, options: CompletionOptions, signal: AbortSignal) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "Titan SEO",
  };
  const referer = getPublicAppUrl();
  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch {
    throw new AttemptError("unavailable", null, "OpenRouter non è raggiungibile");
  }
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    throw new AttemptError(failureOutcome(response.status, error, response.headers), response.status, `OpenRouter ha risposto ${response.status}`);
  }
  const payload = (await response.json().catch(() => null)) as CompletionPayload | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AttemptError("unavailable", response.status, "La risposta di OpenRouter non contiene il testo del modello");
  }
  return { content, model: typeof payload?.model === "string" ? payload.model : body.model, status: response.status };
}

/** Un tentativo con il tempo massimo: oltre timeoutMs la richiesta si interrompe, anche se il server non risponde all'abort. */
async function attemptCompletion(body: TitlesRequest, options: CompletionOptions) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AttemptError("timeout", null, `Il modello non ha risposto entro ${options.timeoutMs} ms`));
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([callOpenRouter(body, options, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Una chiamata a OpenRouter (T-3502): POST {baseUrl}/chat/completions con la chiave come Bearer. Oltre timeoutMs la
 * richiesta si interrompe con AI_TIMEOUT, anche se il server non risponde all'abort; rete, status non 2xx o risposta
 * senza testo → AI_UNAVAILABLE. Nessun nuovo tentativo; né la chiave né il contenuto finiscono nei log (CWE-532).
 */
export async function requestCompletion(body: TitlesRequest, options: CompletionOptions): Promise<{ content: string; model: string }> {
  const { content, model } = await attemptCompletion(body, options);
  return { content, model };
}

type FallbackOptions<T> = {
  apiKey: string;
  baseUrl: string;
  /** Tempo totale di tutti i tentativi, dall'inizio della prima richiesta. */
  deadlineMs: number;
  attemptTimeoutMs: number;
  /** Controllo del testo del modello: un AppError lanciato vale invalid_response e si passa al modello successivo. */
  validate: (content: string) => T;
  /** Modelli segnati come assenti dal catalogo (T-3803): si saltano senza richiesta. */
  skip?: (model: string) => boolean;
};

export type FallbackResult<T> = { attempts: Attempt[] } & ({ ok: true; value: T; model: string } | { ok: false; error: AiTitlesError });

// Esiti dopo i quali gli altri modelli non servono: il limite è dell'account o la chiave non vale.
const STOP_ERRORS: Partial<Record<AttemptOutcome, () => AiTitlesError>> = {
  account_daily_limit: () => new AiTitlesError("AI_DAILY_LIMIT", "Le richieste gratuite di oggi dell'account OpenRouter sono finite"),
  account_rate_limit: () => new AiTitlesError("AI_BUSY", "L'account OpenRouter ha raggiunto il limite di richieste al minuto"),
  auth: () => new AiTitlesError("AI_UNAVAILABLE", "OpenRouter non accetta la chiave o l'account"),
};

/**
 * Richiesta con i modelli di riserva (T-3802, D-46): prova i modelli in ordine, saltando quelli assenti dal catalogo;
 * ogni tentativo ha come tempo massimo il minore fra attemptTimeoutMs e il tempo che resta alla scadenza. Dopo
 * provider_busy, unavailable, timeout e invalid_response si passa al successivo; dopo un limite dell'account o un errore
 * di autenticazione ci si ferma. Senza una risposta valida: AI_BUSY se almeno un fornitore era occupato, altrimenti
 * AI_UNAVAILABLE. Nessun nuovo tentativo sullo stesso modello e nessuna attesa fra un tentativo e l'altro.
 */
export async function requestWithFallback<T>(request: TitlesRequest, models: string[], options: FallbackOptions<T>): Promise<FallbackResult<T>> {
  const startedAt = Date.now();
  const attempts: Attempt[] = [];
  for (const model of models) {
    if (options.skip?.(model)) continue;
    const remainingMs = options.deadlineMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    let completion: Awaited<ReturnType<typeof attemptCompletion>>;
    try {
      completion = await attemptCompletion(
        { ...request, model },
        { apiKey: options.apiKey, baseUrl: options.baseUrl, timeoutMs: Math.min(options.attemptTimeoutMs, remainingMs) }
      );
    } catch (error) {
      if (!(error instanceof AttemptError)) throw error;
      attempts.push({ model, outcome: error.outcome, httpStatus: error.httpStatus });
      const stop = STOP_ERRORS[error.outcome];
      if (stop) return { ok: false, error: stop(), attempts };
      continue;
    }
    try {
      const value = options.validate(completion.content);
      attempts.push({ model, outcome: "ok", httpStatus: completion.status });
      return { ok: true, value, model, attempts };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      attempts.push({ model, outcome: "invalid_response", httpStatus: completion.status });
    }
  }
  const error = attempts.some((attempt) => attempt.outcome === "provider_busy")
    ? new AiTitlesError("AI_BUSY", "I modelli gratuiti dell'elenco sono occupati")
    : new AiTitlesError("AI_UNAVAILABLE", "Nessun modello dell'elenco ha dato una risposta valida");
  return { ok: false, error, attempts };
}
