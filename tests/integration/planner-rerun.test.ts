// Gate di T-910 (AC-910-3, D-19 emendata il 2026-10-06): con il provider di metriche effettivo NONE i volumi
// importati da Keyword Planner restano al re-run della sezione; con un altro provider valgono le sue metriche.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { applyPlannerImport } from "@/lib/modules/planner/import";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Autocomplete senza suggerimenti: l'estrazione produce solo il seed.
vi.mock("@/lib/modules/providers/autocomplete/factory", () => ({
  createAutocompleteProvider: () => ({ id: "MOCK", suggest: async () => [] }),
}));

async function importedSection(metricsProvider: "NONE" | "MOCK") {
  const { user } = await createUserWithSession();
  const project = await prisma.project.create({
    data: {
      name: "Re-run",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: metricsProvider,
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: "caffè espresso" } });
  await runExtractionPipeline(section.id);
  await applyPlannerImport(project.id, section.id, [
    { keyword: "Caffe Espresso", avgMonthlySearches: 1200, precision: "range", competition: 0.2 },
  ]);
  const imported = await prisma.keywordCandidate.findFirstOrThrow({ where: { subproject_id: section.id } });
  return { section, imported };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("re-run di una sezione con volumi importati da Keyword Planner", () => {
  // covers: AC-910-3
  it("con il provider NONE la keyword ancora prodotta conserva volumi, provider, stato, precisione e data", async () => {
    const { section, imported } = await importedSection("NONE");
    expect(imported).toMatchObject({ avg_monthly_searches: 1200, metrics_provider: "PLANNER_CSV", score_source: "metrics" });

    await runExtractionPipeline(section.id);

    const after = await prisma.keywordCandidate.findUniqueOrThrow({ where: { id: imported.id } });
    expect(after.avg_monthly_searches).toBe(1200);
    expect(after.metrics_provider).toBe("PLANNER_CSV");
    expect(after.metrics_status).toBe("imported");
    expect(after.metrics_precision).toBe("range");
    expect(after.score_source).toBe("metrics");
    expect(after.metrics_updated_at?.getTime()).toBe(imported.metrics_updated_at?.getTime());
  });

  it("con un provider diverso da NONE valgono le metriche del provider", async () => {
    const { section, imported } = await importedSection("MOCK");

    await runExtractionPipeline(section.id);

    const after = await prisma.keywordCandidate.findUniqueOrThrow({ where: { id: imported.id } });
    expect(after.metrics_provider).toBe("MOCK");
    expect(after.metrics_status).toBe("mock");
  });
});
