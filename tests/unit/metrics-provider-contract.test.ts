// Gate di T-901 (AC-901-4): il contratto MetricsProvider riceve la keyword di visualizzazione e il canonical,
// e la precisione restituita dal provider arriva alla riga salvata dalla pipeline.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import type { MetricsItem, MetricsOutcome } from "@/lib/modules/providers/metrics/types";

const executeRaw = vi.fn(async (..._args: unknown[]) => 0);
const enrichKeywords = vi.fn(
  async (items: MetricsItem[]): Promise<MetricsOutcome> => ({
    metrics: new Map(
      items.map((item) => [
        item.canonical,
        {
          keyword: item.canonical,
          metrics_status: "fetched" as const,
          metrics_provider: "MOCK" as const,
          metrics_precision: "range" as const,
          avg_monthly_searches: 5500,
        },
      ])
    ),
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subproject: {
      findUnique: vi.fn(async () => ({
        id: "section-1",
        project_id: "project-1",
        language_code_override: null,
        country_code_override: null,
        autocomplete_provider_override: null,
        metrics_provider_override: null,
        min_volume_override: null,
        exclude_brands_override: null,
        expand_alpha_override: false,
        expand_numeric_override: false,
        expand_patterns_override: false,
        auto_classification_override: null,
        scoring_profile_override: null,
        seeds: [{ keyword: "Caffè Espresso" }],
        project: {
          id: "project-1",
          language_code: "it",
          country_code: "IT",
          autocomplete_provider: "MOCK",
          metrics_provider: "MOCK",
          min_volume: 0,
          exclude_brands: true,
          expand_alpha: false,
          expand_numeric: false,
          expand_patterns: false,
          auto_classification: true,
          scoring_profile: "balanced",
        },
      })),
    },
    expansionPattern: { findMany: vi.fn(async () => []) },
    brandBlacklist: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $executeRaw: executeRaw })),
  },
}));

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({ id: "MOCK", suggest: async () => [] }),
}));

vi.mock("@/lib/modules/providers/metrics/factory", () => ({
  createMetricsProvider: () => ({ id: "MOCK", enrichKeywords }),
}));

/** Parametro legato alla colonna con il cast indicato, nella prima scrittura (upsert) della pipeline. */
function boundValue(cast: string): unknown {
  const [strings, ...values] = executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  const statement = Prisma.sql(strings, ...(values as Prisma.Sql[]));
  const match = statement.text.match(new RegExp(`\\$(\\d+)::"${cast}"`));
  expect(match).not.toBeNull();
  return statement.values[Number(match![1]) - 1];
}

beforeEach(() => {
  executeRaw.mockClear();
  enrichKeywords.mockClear();
});

describe("contratto MetricsProvider nella pipeline", () => {
  // covers: AC-901-4
  it("passa displayKeyword con gli accenti e il canonical, e salva la precisione restituita", async () => {
    const { runExtractionPipeline } = await import("@/lib/modules/pipeline/extraction");

    await runExtractionPipeline("section-1");

    expect(enrichKeywords).toHaveBeenCalledTimes(1);
    const [items, context] = enrichKeywords.mock.calls[0] as unknown as [MetricsItem[], unknown];
    expect(items).toEqual([{ displayKeyword: "Caffè Espresso", canonical: "caffe espresso" }]);
    expect(context).toEqual({ languageCode: "it", countryCode: "IT" });
    expect(boundValue("MetricsPrecision")).toBe("range");
  });
});
