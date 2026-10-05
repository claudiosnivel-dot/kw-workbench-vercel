// Gate di T-909 (AC-909-1): limitatore a 12 richieste per 60 secondi, retry sugli errori transitori e
// nessuna credenziale nei log, con timer finti e fetch simulato (nessuna chiamata reale, D-30).
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataForSeoMetricsProvider, resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import type { MetricsItem } from "@/lib/modules/providers/metrics/types";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

const sentAt: number[] = [];
let calls = 0;

const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
  sentAt.push(Date.now());
  calls += 1;
  if (calls === 1) {
    return Response.json({ status_code: 50000, status_message: "Internal Error." }, { status: 500 });
  }
  const [task] = JSON.parse(String(init?.body)) as { keywords: string[] }[];
  return Response.json({
    status_code: 20000,
    cost: 0.09,
    tasks: [
      {
        id: `task-${calls}`,
        status_code: 20000,
        cost: 0.09,
        result: task.keywords.map((keyword) => ({ keyword, spell: null, search_volume: 40 })),
      },
    ],
  });
});

function maxRequestsInAnyWindow(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return Math.max(...sorted.map((start) => sorted.filter((time) => time >= start && time - start < WINDOW_MS).length));
}

let password = "";

beforeEach(() => {
  password = randomBytes(12).toString("hex");
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", password);
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  sentAt.length = 0;
  calls = 0;
  fetchMock.mockClear();
  resetDataForSeoLimiterForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("limitatore e retry del provider DataForSEO", () => {
  // covers: AC-909-1
  it("non supera 12 richieste in 60 secondi, ripete il lotto fallito e non scrive la password nei log", async () => {
    const logs: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      });
    }
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    });
    const items: MetricsItem[] = Array.from({ length: 13_000 }, (_, index) => ({
      displayKeyword: `keyword limite ${index}`,
      canonical: `keyword limite ${index}`,
    }));

    const pending = new DataForSeoMetricsProvider().enrichKeywords(items, { languageCode: "it", countryCode: "IT" });
    await vi.runAllTimersAsync();
    const outcome = await pending;
    stdout.mockRestore();

    const bodies = fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { keywords: string[] }[])[0]);
    expect(bodies).toHaveLength(14);
    expect(maxRequestsInAnyWindow(sentAt)).toBeLessThanOrEqual(MAX_PER_WINDOW);
    expect(bodies[1].keywords).toEqual(bodies[0].keywords);
    expect(bodies.filter((body) => body.keywords[0] === bodies[0].keywords[0])).toHaveLength(2);
    expect([...outcome.metrics.values()].every((metric) => metric.metrics_status === "fetched")).toBe(true);
    expect(outcome.metrics.size).toBe(13_000);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.filter((line) => line.includes(password))).toEqual([]);
  });
});
