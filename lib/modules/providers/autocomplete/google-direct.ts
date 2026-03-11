import { AutocompleteProviderClient, AutocompleteSuggestion, SuggestionRequest } from "@/lib/modules/providers/autocomplete/types";

const cache = new Map<string, { expiresAt: number; data: AutocompleteSuggestion[] }>();
let rateLimiter = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractKeywords(payload: unknown): string[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    const list = payload[1];
    if (Array.isArray(list)) {
      return list.filter((item): item is string => typeof item === "string");
    }

    return payload.flatMap((item) => extractKeywords(item));
  }

  if (typeof payload === "object") {
    const values = Object.values(payload as Record<string, unknown>);
    return values.flatMap((value) => extractKeywords(value));
  }

  return [];
}

async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const intervalMs = Math.max(50, Number(process.env.AUTOCOMPLETE_RATE_LIMIT_MS ?? 180));

  rateLimiter = rateLimiter.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, intervalMs - (now - lastRequestAt));
    if (wait > 0) {
      await sleep(wait);
    }
    lastRequestAt = Date.now();
  });

  await rateLimiter;
  return fn();
}

export class GoogleDirectAutocompleteProvider implements AutocompleteProviderClient {
  readonly id = "GOOGLE_DIRECT";

  async suggest(input: SuggestionRequest): Promise<AutocompleteSuggestion[]> {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    const cacheTtlMs = Math.max(30_000, Number(process.env.AUTOCOMPLETE_CACHE_TTL_MS ?? 300_000));
    const cacheKey = `${input.languageCode}|${input.countryCode}|${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const maxRetries = Math.max(0, Number(process.env.AUTOCOMPLETE_MAX_RETRIES ?? 2));
    const timeoutMs = Math.max(1000, Number(process.env.AUTOCOMPLETE_TIMEOUT_MS ?? 4500));

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        const suggestions = await withRateLimit(() => this.fetchSuggestions(input, timeoutMs));

        cache.set(cacheKey, {
          expiresAt: Date.now() + cacheTtlMs,
          data: suggestions,
        });

        return suggestions;
      } catch (error) {
        lastError = error;
        attempt += 1;
        const delayMs = Math.min(3000, 250 * Math.pow(2, attempt));
        await sleep(delayMs);
      }
    }

    console.warn("GoogleDirectAutocompleteProvider fallback triggered", {
      query,
      languageCode: input.languageCode,
      countryCode: input.countryCode,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });

    // Safe fallback: return no external suggestions and keep the pipeline alive.
    return [{ keyword: query, source: "google-direct-fallback", sourceQuery: query }];
  }

  private async fetchSuggestions(input: SuggestionRequest, timeoutMs: number): Promise<AutocompleteSuggestion[]> {
    const endpoint =
      process.env.GOOGLE_AUTOCOMPLETE_ENDPOINT ??
      "https://suggestqueries.google.com/complete/search";

    const url = new URL(endpoint);
    url.searchParams.set("client", process.env.GOOGLE_AUTOCOMPLETE_CLIENT ?? "firefox");
    url.searchParams.set("q", input.query);
    url.searchParams.set("hl", input.languageCode);
    url.searchParams.set("gl", input.countryCode);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "seo-god-mode/1.0",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Autocomplete HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const rawKeywords = extractKeywords(payload);

      // Fragile-by-design parsing: sanitize aggressively and do not assume stable schema.
      const unique = new Set<string>();
      for (const value of rawKeywords) {
        const cleaned = String(value).trim();
        if (!cleaned) {
          continue;
        }
        unique.add(cleaned);
      }

      return Array.from(unique).map((keyword) => ({
        keyword,
        source: "google-direct",
        sourceQuery: input.query,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}
