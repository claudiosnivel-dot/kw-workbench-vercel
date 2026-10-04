// Gate di T-306 (AC-306-1, AC-306-2): niente keyword fittizie, retry solo sugli errori transitori.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoogleDirectAutocompleteProvider,
  resetAutocompleteCacheForTests,
} from "@/lib/modules/providers/autocomplete/google-direct";
import { AutocompleteQueryFailedError } from "@/lib/modules/providers/autocomplete/types";

const fetchMock = vi.fn<typeof fetch>();
const wait = vi.fn(async (_ms: number) => {});

function statusResponse(status: number): Response {
  return new Response("", { status });
}

function suggestionsResponse(query: string, keywords: string[]): Response {
  return new Response(JSON.stringify([query, keywords]), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function suggest(query: string) {
  return new GoogleDirectAutocompleteProvider({ wait }).suggest({ query, languageCode: "it", countryCode: "IT" });
}

beforeAll(() => {
  vi.stubEnv("AUTOCOMPLETE_MAX_RETRIES", "2");
  vi.stubEnv("AUTOCOMPLETE_RATE_LIMIT_MS", "50");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fetchMock.mockReset();
  wait.mockClear();
  resetAutocompleteCacheForTests();
});

describe("GoogleDirectAutocompleteProvider con servizio in errore", () => {
  // covers: AC-306-1
  it("dopo i retry su 503 rigetta con AutocompleteQueryFailedError senza fallback", async () => {
    fetchMock.mockImplementation(async () => statusResponse(503));

    const outcome = await suggest("caffe moka").then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error })
    );

    expect(outcome.error).toBeInstanceOf(AutocompleteQueryFailedError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect((outcome.value ?? []).filter((row) => row.source === "google-direct-fallback")).toEqual([]);
  });
});

describe("GoogleDirectAutocompleteProvider: retry solo sugli errori transitori", () => {
  // covers: AC-306-2
  it("404, 403 e 400 falliscono al primo tentativo; 429 seguito da 200 si risolve con i suggerimenti", async () => {
    for (const status of [404, 403, 400]) {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async () => statusResponse(status));

      await expect(suggest(`query ${status}`)).rejects.toBeInstanceOf(AutocompleteQueryFailedError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(statusResponse(429))
      .mockResolvedValueOnce(suggestionsResponse("query 429", ["query 429 uno", "query 429 due"]));

    await expect(suggest("query 429")).resolves.toEqual([
      { keyword: "query 429 uno", source: "google-direct", sourceQuery: "query 429" },
      { keyword: "query 429 due", source: "google-direct", sourceQuery: "query 429" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
