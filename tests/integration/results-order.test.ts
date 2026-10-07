// Gate di T-707 (AC-707-3, AC-707-4): le keyword con metriche precedono quelle con solo punteggio
// euristico (D-18), nella lettura dei risultati e nell'export; ogni riga salvata dichiara la sorgente.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { runExtractionPipeline } from "@/lib/modules/pipeline/extraction";
import { RESULTS_ORDER_BY } from "@/lib/modules/results-order";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

async function createSection(settings: { metrics_provider: "NONE" | "MOCK" }) {
  const owner = await createUserWithSession({ displayName: "t707-owner" });
  const project = await prisma.project.create({
    data: {
      name: "Ordinamento",
      owner_user_id: owner.user.id,
      language_code: "it",
      country_code: "IT",
      autocomplete_provider: "MOCK",
      metrics_provider: settings.metrics_provider,
      expand_alpha: false,
      expand_numeric: false,
      expand_patterns: false,
    },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  return { cookie: owner.cookie, projectId: project.id, sectionId: section.id };
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("ordinamento dei risultati per sorgente del punteggio", () => {
  // covers: AC-707-3
  it("la keyword misurata precede quella euristica con punteggio più alto, in lettura e nell'export", async () => {
    const { cookie, projectId, sectionId } = await createSection({ metrics_provider: "NONE" });
    const base = { project_id: projectId, subproject_id: sectionId, source: "seed", review_status: "pending" as const };
    await prisma.keywordCandidate.createMany({
      data: [
        {
          ...base,
          keyword: "scarpe running uomo",
          normalized_keyword: "scarpe running uomo",
          canonical_keyword: "scarpe running uomo",
          source_query: "scarpe running uomo",
          metrics_status: "missing",
          score: 88,
          score_source: "heuristic",
        },
        {
          ...base,
          keyword: "scarpe running",
          normalized_keyword: "scarpe running",
          canonical_keyword: "scarpe running",
          source_query: "scarpe running",
          metrics_status: "fetched",
          avg_monthly_searches: 1000,
          competition: 0.5,
          score: 51.25,
          score_source: "metrics",
        },
      ],
    });

    const read = await prisma.keywordCandidate.findMany({
      where: { subproject_id: sectionId },
      orderBy: RESULTS_ORDER_BY,
      select: { keyword: true, score_source: true },
    });
    const response = await callRoute(exportProject, {
      url: `/api/projects/${projectId}/export?format=json&scope=filtered`,
      cookie,
      params: { id: projectId },
    });
    const exported = (await response.json()) as { keyword: string; score_source: string }[];

    const expected = [
      { keyword: "scarpe running", score_source: "metrics" },
      { keyword: "scarpe running uomo", score_source: "heuristic" },
    ];
    expect(read).toEqual(expected);
    expect(response.status).toBe(200);
    expect(exported.map(({ keyword, score_source }) => ({ keyword, score_source }))).toEqual(expected);
  });
});

describe("sorgente salvata dall'estrazione", () => {
  // covers: AC-707-4
  it("con metriche MOCK ogni riga ha score_source metrics e nessuna è nulla", async () => {
    const { projectId, sectionId } = await createSection({ metrics_provider: "MOCK" });
    await prisma.seed.create({ data: { project_id: projectId, subproject_id: sectionId, keyword: "caffè moka" } });

    await runExtractionPipeline(sectionId);

    const rows = await prisma.keywordCandidate.findMany({ where: { subproject_id: sectionId }, select: { score_source: true } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((row) => row.score_source !== "metrics")).toEqual([]);
    expect(rows.some((row) => row.score_source === null)).toBe(false);
  });
});
