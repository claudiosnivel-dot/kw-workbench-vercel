// Gate di T-901 (AC-901-4): il contratto MetricsProvider riceve la keyword di visualizzazione e il canonical,
// e la precisione restituita dal provider arriva alla riga salvata dalla pipeline.
// impacted-by: T-1202 (la pipeline a passi scrive job, staging e risultati sul DB: il test passa da tests/unit con
// il client Prisma simulato al DB di test, con le stesse asserzioni sul provider e sulla riga salvata)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import type { MetricsItem, MetricsOutcome } from "@/lib/modules/providers/metrics/types";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

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

vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({ id: "MOCK", suggest: async () => [] }),
}));

vi.mock("@/lib/modules/providers/metrics/factory", () => ({
  createMetricsProvider: () => ({ id: "MOCK", enrichKeywords }),
}));

beforeEach(async () => {
  enrichKeywords.mockClear();
  await resetDatabase();
});

describe("contratto MetricsProvider nella pipeline", () => {
  // covers: AC-901-4
  it("passa displayKeyword con gli accenti e il canonical, e salva la precisione restituita", async () => {
    const { user } = await createUserWithSession({ displayName: "t901-owner" });
    const project = await prisma.project.create({
      data: {
        name: "Contratto metriche",
        workspace_id: await personalWorkspaceId(user.id),
        language_code: "it",
        country_code: "IT",
        autocomplete_provider: "MOCK",
        metrics_provider: "MOCK",
        expand_alpha: false,
        expand_numeric: false,
        expand_patterns: false,
      },
    });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "Caffè Espresso" } });

    await runExtractionPipeline(section.id);

    expect(enrichKeywords).toHaveBeenCalledTimes(1);
    const [items, context] = enrichKeywords.mock.calls[0] as unknown as [MetricsItem[], unknown];
    expect(items).toEqual([{ displayKeyword: "Caffè Espresso", canonical: "caffe espresso" }]);
    expect(context).toMatchObject({ languageCode: "it", countryCode: "IT", projectId: project.id });
    const saved = await prisma.keywordCandidate.findFirstOrThrow({ where: { subproject_id: section.id } });
    expect(saved.metrics_precision).toBe("range");
  });
});
