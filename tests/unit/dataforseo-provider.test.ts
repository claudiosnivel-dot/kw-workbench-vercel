// Gate di T-902 (AC-902-1…AC-902-3): provider DataForSEO con fetch simulato, nessuna chiamata reale (D-30).
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataForSeoMetricsProvider } from "@/lib/modules/providers/metrics/dataforseo";
import { toMetricsResult, type MetricsItem } from "@/lib/modules/providers/metrics/types";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

// impacted-by: T-903 — registro e tetti di spesa sono nel DB: qui una prenotazione sempre accettata, senza DB.
vi.mock("@/lib/modules/providers/metrics/metrics-ledger", () => ({
  reserveProviderRequest: vi.fn(async () => ({ ok: true, id: "request" })),
  settleProviderRequest: vi.fn(async () => {}),
  recentProviderRequestTimes: vi.fn(async () => []),
}));

type TaskBody = { keywords: string[]; location_code: number; language_code: string; search_partners: boolean };

const ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

// Credenziali fittizie generate a ogni esecuzione: mai un valore reale nel sorgente.
let login = "";
let password = "";

const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
  const [task] = JSON.parse(String(init?.body)) as TaskBody[];
  return Response.json({
    status_code: 20000,
    status_message: "Ok.",
    cost: 0.09,
    tasks: [
      {
        id: "task-1",
        status_code: 20000,
        status_message: "Ok.",
        cost: 0.09,
        result: task.keywords.map((keyword) => ({
          keyword: keyword.toLowerCase(),
          spell: null,
          search_volume: 1300,
          competition: "LOW",
          competition_index: 12,
          low_top_of_page_bid: 0.12,
          high_top_of_page_bid: 0.85,
          cpc: 0.4,
        })),
      },
    ],
  });
});

function item(displayKeyword: string, languageCode = "it"): MetricsItem {
  return { displayKeyword, canonical: canonicalizeKeyword(displayKeyword, languageCode) };
}

function sentBodies(): TaskBody[] {
  return fetchMock.mock.calls.map(([, init]) => {
    const tasks = JSON.parse(String(init?.body)) as TaskBody[];
    expect(tasks).toHaveLength(1);
    return tasks[0];
  });
}

beforeEach(() => {
  login = `login-${randomBytes(6).toString("hex")}`;
  password = randomBytes(12).toString("hex");
  vi.stubEnv("DATAFORSEO_LOGIN", login);
  vi.stubEnv("DATAFORSEO_PASSWORD", password);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider DataForSEO", () => {
  // covers: AC-902-1
  it("invia lotti da 1000 con location e lingua, autenticazione Basic e somma il costo", async () => {
    const items = [item("Caffè Espresso"), ...Array.from({ length: 2499 }, (_, index) => item(`keyword prova ${index}`))];

    const outcome = await new DataForSeoMetricsProvider().enrichKeywords(items, { languageCode: "it", countryCode: "IT" });

    const bodies = sentBodies();
    expect(bodies.map((body) => body.keywords.length)).toEqual([1000, 1000, 500]);
    for (const body of bodies) {
      expect(body.location_code).toBe(2380);
      expect(body.language_code).toBe("it");
      expect(body.search_partners).toBe(false);
    }
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe(ENDPOINT);
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`
      );
    }
    const espresso = outcome.metrics.get("caffe espresso");
    expect(espresso?.metrics_status).toBe("fetched");
    expect(espresso?.metrics_provider).toBe("DATAFORSEO");
    expect(espresso?.metrics_precision).toBe("exact");
    expect(espresso?.avg_monthly_searches).toBe(1300);
    expect(espresso?.competition).toBe(0.12);
    expect(espresso?.low_top_of_page_bid_micros).toBe(120_000n);
    expect(espresso?.high_top_of_page_bid_micros).toBe(850_000n);
    expect(toMetricsResult(outcome).metricsCostUsd).toBe(0.27);
    expect(toMetricsResult(outcome).metricsRequests).toBe(3);
  });

  // covers: AC-902-2
  it("scarta senza chiamata le keyword oltre i limiti o con simboli non ammessi e le conta per motivo", async () => {
    const tooLong = item("a".repeat(81));
    const tooManyWords = item("uno due tre quattro cinque sei sette otto nove dieci undici");
    const withEmoji = item("tazzine moka 😀");
    const valid = ["caffè moka", "moka express", "moka 6 tazze", "caffettiera moka", "moka induzione"].map((keyword) =>
      item(keyword)
    );

    const outcome = await new DataForSeoMetricsProvider().enrichKeywords([tooLong, tooManyWords, withEmoji, ...valid], {
      languageCode: "it",
      countryCode: "IT",
    });

    const sent = sentBodies().flatMap((body) => body.keywords);
    expect(sent).toEqual(valid.map((entry) => entry.displayKeyword));
    for (const skipped of [tooLong, tooManyWords, withEmoji]) {
      expect(outcome.metrics.get(skipped.canonical)?.metrics_status).toBe("missing");
    }
    for (const entry of valid) {
      expect(outcome.metrics.get(entry.canonical)?.metrics_status).toBe("fetched");
    }
    expect(toMetricsResult(outcome).metricsSkipped).toEqual({ too_long: 1, too_many_words: 1, invalid_symbols: 1 });
  });

  // covers: AC-902-3
  it("con un paese senza location o senza credenziali non chiama il fornitore e dichiara il motivo", async () => {
    const items = [item("caffè moka", "ru"), item("moka express", "ru")];

    const unsupported = await new DataForSeoMetricsProvider().enrichKeywords(items, { languageCode: "ru", countryCode: "RU" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect([...unsupported.metrics.values()].map((metric) => metric.metrics_status)).toEqual(["missing", "missing"]);
    expect(toMetricsResult(unsupported).metricsNotice).toBe("LOCATION_UNSUPPORTED");

    vi.stubEnv("DATAFORSEO_LOGIN", "");
    const notConfigured = await new DataForSeoMetricsProvider().enrichKeywords(items, { languageCode: "it", countryCode: "IT" });

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("api.dataforseo.com"))).toHaveLength(0);
    expect([...notConfigured.metrics.values()].map((metric) => metric.metrics_status)).toEqual(["missing", "missing"]);
    expect(toMetricsResult(notConfigured).metricsNotice).toBe("PROVIDER_NOT_CONFIGURED");
  });
});
