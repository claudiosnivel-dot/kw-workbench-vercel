// Gate di T-6602 (AC-6602-1, D-61): il caso visto in produzione il 2026-11-14 su «Noleggio magnetoterapia». Il piano
// fatto quando i risultati di Google erano link goto ha la pilastro da scrivere con 173 keyword su 175 e due spoke in
// scrittura con una keyword ciascuno; rigenerato con i risultati di Google veri della fixture it-magnetoterapia-real-serp
// (salvati da poco in keyword_serps, quindi nessun task a DataForSEO), la pilastro tiene la keyword principale e il motore
// ridistribuisce le altre (T-6601). OpenRouter risponde 503 (solo i riconoscimenti fissi), i volumi mancanti tornano
// vuoti e le continuazioni sono simulate: nessuna chiamata reale.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { prisma } from "@/lib/prisma";
import { saveAiSettings, stubOpenRouterEnv } from "../helpers/ai-titles";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { generatePlan, noVolumesResponse, VOLUMES_URL_PART } from "../helpers/plan-run";
import { insertStrategy, MAGNETOTHERAPY_REAL_SERP_FIXTURE } from "../helpers/strategy";

vi.mock("@/lib/modules/jobs/continuation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules/jobs/continuation")>()),
  schedulePlanRunContinuation: vi.fn(),
}));

const FIXTURE = MAGNETOTHERAPY_REAL_SERP_FIXTURE;
const canonical = (text: string) => canonicalizeKeyword(text, "it");
const PILLAR = "noleggio magnetoterapia";
const WRITING_SPOKES = ["noleggio magnetoterapia costo", "noleggio magnetoterapia farmacia"];

/** OpenRouter giù (503 a ogni modello) e DataForSEO senza volumi per le keyword che non ne hanno; il resto è 404. */
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://openrouter.test/")) return new Response("{}", { status: 503 });
  if (url.includes(VOLUMES_URL_PART)) return noVolumesResponse(init);
  return new Response("{}", { status: 404 });
});

beforeAll(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("JOB_MAX_ATTEMPTS", "5");
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_COST_PER_REQUEST_USD", "0.09");
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
  stubOpenRouterEnv();
  resetEnvForTests();
  resetDataForSeoLimiterForTests();
  await saveAiSettings({ models: ["autore/primo:free", "autore/secondo:free"] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

/**
 * Progetto it-IT del root admin con le 175 keyword tenute della fixture, i loro risultati di Google salvati da poco e il
 * piano di produzione del 2026-11-14: pilastro da scrivere con tutte le keyword tranne le due degli spoke in scrittura.
 */
async function productionLikeProject(session: Session) {
  const project = await prisma.project.create({
    data: { name: "Noleggio magnetoterapia", workspace_id: session.workspaceId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.create({ data: { project_id: project.id, subproject_id: section.id, keyword: FIXTURE.seeds[0] } });
  await prisma.keywordCandidate.createMany({
    data: FIXTURE.keywords.map((item) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword: item.keyword,
      normalized_keyword: canonical(item.keyword),
      canonical_keyword: canonical(item.keyword),
      source: "seed" as const,
      source_query: FIXTURE.seeds[0],
      search_intent: item.searchIntent as "mixed",
      keyword_type: item.keywordType as "generic",
      is_question: item.isQuestion ?? false,
      is_local_intent: item.keywordType === "local",
      avg_monthly_searches: item.volume,
      score: item.score,
      score_source: item.volume === null ? ("heuristic" as const) : ("metrics" as const),
    })),
  });
  await prisma.keywordSerp.createMany({
    data: FIXTURE.keywords.map((item) => ({ language_code: "it", country_code: "IT", canonical_keyword: canonical(item.keyword), urls: item.urls })),
  });

  const volumeOf = new Map(FIXTURE.keywords.map((item) => [canonical(item.keyword), item.volume]));
  const spec = (text: string) => ({ text, volume: volumeOf.get(text) ?? null });
  const pillarKeywords = [PILLAR, ...[...volumeOf.keys()].filter((text) => text !== PILLAR && !WRITING_SPOKES.includes(text))];
  await insertStrategy({
    projectId: project.id,
    createdAt: new Date("2026-11-14T12:00:00Z"),
    pages: [
      { key: "pillar", kind: "HUB", keywords: pillarKeywords.map(spec), status: "TODO" },
      ...WRITING_SPOKES.map((text) => ({ key: text, kind: "SPOKE" as const, hub: "pillar", keywords: [spec(text)], status: "WRITING" as const })),
    ],
  });
  return { projectId: project.id, pillarKeywords };
}

describe("rigenerazione sui risultati di Google veri", () => {
  // covers: AC-6602-1
  it("la pilastro da scrivere di «Noleggio magnetoterapia» scende sotto metà del piano e il suo hub riceve spoke nuovi", async () => {
    const admin = await createUserWithSession({ isRootAdmin: true });
    const { projectId, pillarKeywords } = await productionLikeProject(admin);
    expect(FIXTURE.keywords).toHaveLength(175);
    expect([PILLAR, ...WRITING_SPOKES].every((text) => FIXTURE.keywords.some((item) => canonical(item.keyword) === text))).toBe(true);
    expect(pillarKeywords).toHaveLength(173);

    const { response, run, strategyId } = await generatePlan(admin.cookie, projectId, { mode: "AUTO", regenerate: true });

    expect(response.status).toBe(202);
    expect(run).toMatchObject({ status: "completed", phase: "done" });
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId! }, select: { grouping_source: true } });
    expect(strategy.grouping_source).toBe("SERP");
    const pages = await prisma.strategyPage.findMany({
      where: { strategy_id: strategyId! },
      select: { id: true, kind: true, hub_page_id: true, status: true, keywords: { select: { canonical_keyword: true, role: true } } },
    });
    const keywords = await prisma.strategyKeyword.findMany({ where: { strategy_id: strategyId! }, select: { canonical_keyword: true, page_id: true } });
    const inPlan = keywords.filter((keyword) => keyword.page_id !== null).length;
    const pillar = pages.find((page) => page.keywords.some((keyword) => keyword.role === "MAIN" && keyword.canonical_keyword === PILLAR))!;
    expect(pillar).toMatchObject({ kind: "HUB", status: "TODO" });
    expect(pillar.keywords.length).toBeLessThan(inPlan / 2);
    const spokes = pages.filter((page) => page.hub_page_id === pillar.id);
    for (const text of WRITING_SPOKES) {
      expect(spokes.find((page) => page.keywords.some((keyword) => keyword.canonical_keyword === text))).toMatchObject({
        status: "WRITING",
        keywords: [{ canonical_keyword: text, role: "MAIN" }],
      });
    }
    expect(spokes.filter((page) => page.status === "TODO").length).toBeGreaterThanOrEqual(4);
    expect(keywords).toHaveLength(175);
    expect(new Set(keywords.map((keyword) => keyword.canonical_keyword)).size).toBe(175);
    // Nessun task dei risultati di Google: quelli salvati bastano.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/v3/serp/"))).toHaveLength(0);
  });
});
