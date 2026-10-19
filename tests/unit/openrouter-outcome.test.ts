// Gate di T-3802 (AC-3802-1, AC-3802-3), parte del client: esito di ogni risposta non riuscita di OpenRouter e
// richiesta con i modelli di riserva, che passa al modello successivo quando il fornitore è occupato e si ferma al
// limite giornaliero dell'account.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failureOutcome, requestWithFallback } from "@/lib/ai/openrouter";
import { buildTitlesRequest } from "@/lib/ai/titles-prompt";
import { parseTitlesResponse } from "@/lib/ai/titles-response";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

// impacted-by: T-3901 (ogni tentativo scrive una riga di ai_requests): qui il registro è simulato, il test unitario non
// ha il DB; la scrittura vera la provano tests/integration/ai-requests.test.ts.
vi.mock("@/lib/ai/requests", () => ({ recordAiRequest: vi.fn(async () => {}) }));

const NOW = Date.parse("2026-10-19T10:00:00.000Z");

const spoke = {
  kind: "SPOKE" as const,
  contentType: "guide" as const,
  main: { keyword: "scarpe running donna", canonical: canonicalizeKeyword("scarpe running donna", "it"), isQuestion: false, volume: null, score: 50 },
  secondary: [],
};

/** Corpo d'errore di OpenRouter: { error: { code, message, metadata } }. */
function errorBody(message: string, metadata: Record<string, unknown> = {}) {
  return { error: { code: 429, message, metadata } };
}

const providerBusy = () =>
  Response.json(errorBody("Provider returned error", { provider_name: "Google AI Studio", raw: "temporarily rate-limited upstream" }), { status: 429 });
const dailyLimit = () =>
  Response.json(
    errorBody("Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day", {
      headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(NOW + 6 * 3_600_000) },
      provider_name: null,
    }),
    { status: 429 }
  );
const completion = (h1: string) =>
  Response.json({ model: "ignorato", choices: [{ message: { content: JSON.stringify({ h1, h2: ["Ammortizzazione"] }) } }] });

describe("esito di una risposta non riuscita", () => {
  // covers: AC-3802-1, AC-3802-3
  it("distingue fornitore occupato, limiti dell'account, autenticazione e indisponibilità", async () => {
    const outcome = async (response: Response) => failureOutcome(response.status, await response.json(), response.headers, NOW);
    const minuteReset = new Headers({ "X-RateLimit-Reset": String(NOW + 30_000) });

    expect(await outcome(providerBusy())).toBe("provider_busy");
    expect(await outcome(dailyLimit())).toBe("account_daily_limit");
    expect(failureOutcome(429, errorBody("Rate limit exceeded: free-models-per-min."), minuteReset, NOW)).toBe("account_rate_limit");
    expect(failureOutcome(429, errorBody("Rate limit exceeded"), new Headers({ "X-RateLimit-Reset": String(NOW + 5 * 3_600_000) }), NOW)).toBe(
      "account_daily_limit"
    );
    expect(failureOutcome(401, errorBody("No auth credentials found"), new Headers(), NOW)).toBe("auth");
    expect(failureOutcome(402, null, new Headers(), NOW)).toBe("auth");
    for (const status of [403, 404, 500, 503]) {
      expect(failureOutcome(status, errorBody("errore"), new Headers(), NOW)).toBe("unavailable");
    }
  });
});

describe("richiesta con i modelli di riserva", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const options = {
    apiKey: randomUUID(),
    baseUrl: "https://openrouter.test/api/v1",
    deadlineMs: 25_000,
    attemptTimeoutMs: 20_000,
    validate: (content: string) => parseTitlesResponse(content, spoke, "it"),
    record: { feature: "titles" as const, workspaceId: null, byRootAdmin: false },
  };
  const request = buildTitlesRequest(spoke, { language: "it", model: "a/uno:free" });
  const sentModels = () => fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { model: string }).model);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // covers: AC-3802-1
  it("dopo il fornitore occupato prova il modello successivo e restituisce quello che ha risposto", async () => {
    fetchMock.mockResolvedValueOnce(providerBusy()).mockResolvedValueOnce(completion("Scarpe running donna: come sceglierle"));

    const result = await requestWithFallback(request, ["a/uno:free", "a/due:free", "a/tre:free"], options);

    expect(result).toMatchObject({ ok: true, model: "a/due:free", value: { h1: "Scarpe running donna: come sceglierle" } });
    expect(result.attempts).toEqual([
      { model: "a/uno:free", outcome: "provider_busy", httpStatus: 429 },
      { model: "a/due:free", outcome: "ok", httpStatus: 200 },
    ]);
    expect(sentModels()).toEqual(["a/uno:free", "a/due:free"]);
  });

  // covers: AC-3802-3
  it("al limite giornaliero dell'account si ferma subito con AI_DAILY_LIMIT", async () => {
    fetchMock.mockImplementation(async () => dailyLimit());

    const result = await requestWithFallback(request, ["a/uno:free", "a/due:free", "a/tre:free"], options);

    expect(result.ok).toBe(false);
    expect(result.ok ? null : { code: result.error.code, status: result.error.status }).toEqual({ code: "AI_DAILY_LIMIT", status: 429 });
    expect(result.attempts).toEqual([{ model: "a/uno:free", outcome: "account_daily_limit", httpStatus: 429 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("salta i modelli assenti dal catalogo e dà a ogni tentativo il tempo che resta alla scadenza", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
      const pending = requestWithFallback(request, ["a/assente:free", "a/uno:free", "a/due:free"], {
        ...options,
        skip: (model) => model === "a/assente:free",
      });
      await vi.advanceTimersByTimeAsync(25_000);
      const result = await pending;

      expect(result.attempts).toEqual([
        { model: "a/uno:free", outcome: "timeout", httpStatus: null },
        { model: "a/due:free", outcome: "timeout", httpStatus: null },
      ]);
      expect(result.ok ? null : result.error.code).toBe("AI_UNAVAILABLE");
      expect(sentModels()).toEqual(["a/uno:free", "a/due:free"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
