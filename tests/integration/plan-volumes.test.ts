// Gate di T-6102 (AC-6102-1…AC-6102-3, D-57): i volumi delle keyword tenute del perimetro che non li hanno ancora, chiesti
// da soli a DataForSEO prima del piano e salvati sulle keyword con il punteggio ricalcolato; tieni/scarta non cambia
// (D-19). Regola dei dati con licenza (D-30) e tetti di spesa (T-903). Fetch di DataForSEO simulato, nessuna chiamata reale.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole, type ReviewStatus } from "@/lib/generated/prisma/client";
import { resetEnvForTests } from "@/lib/env";
import { fillPerimeterVolumes } from "@/lib/modules/plan-data/volumes";
import { resetDataForSeoLimiterForTests } from "@/lib/modules/providers/metrics/dataforseo";
import { AUTO_SETTINGS } from "@/lib/modules/strategy/rules";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

const VOLUMES = new Map([
  ["noleggio magnetoterapia", 90],
  ["noleggio magnetoterapia costo", 40],
  ["noleggio magnetoterapia milano", 10],
]);

const requestedKeywords: string[][] = [];

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  if (!String(input).includes("/keywords_data/google_ads/search_volume/live")) {
    return new Response("{}", { status: 404 });
  }
  const [task] = JSON.parse(String(init?.body)) as { keywords: string[] }[];
  requestedKeywords.push(task.keywords);
  return Response.json({
    status_code: 20000,
    cost: 0.09,
    tasks: [
      {
        id: `task-${requestedKeywords.length}`,
        status_code: 20000,
        cost: 0.09,
        result: task.keywords.map((keyword) => ({ keyword, spell: null, search_volume: VOLUMES.get(keyword) ?? 0, competition_index: 30 })),
      },
    ],
  });
});

type Row = { keyword: string; review: ReviewStatus; volume?: number };

const ROWS: Row[] = [
  { keyword: "noleggio magnetoterapia", review: "pending" },
  { keyword: "noleggio magnetoterapia costo", review: "approved" },
  { keyword: "noleggio magnetoterapia milano", review: "pending" },
  { keyword: "magnetoterapia a casa", review: "pending", volume: 500 },
  { keyword: "magnetoterapia usata", review: "rejected" },
];

/** Progetto it-IT con le 5 keyword di ROWS nella sua unica sezione. */
async function createProject(options: { isRootAdmin: boolean; role?: UserRole }) {
  const { workspaceId } = await createUserWithSession({ isRootAdmin: options.isRootAdmin, role: options.role });
  const project = await prisma.project.create({
    data: { name: "Magnetoterapia", workspace_id: workspaceId, language_code: "it", country_code: "IT", metrics_provider: "NONE" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.keywordCandidate.createMany({
    data: ROWS.map((row) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword: row.keyword,
      normalized_keyword: row.keyword,
      canonical_keyword: row.keyword,
      source: "seed",
      source_query: row.keyword,
      review_status: row.review,
      score: 40,
      ...(row.volume === undefined
        ? {}
        : { avg_monthly_searches: row.volume, metrics_status: "imported" as const, metrics_provider: "PLANNER_CSV" as const }),
    })),
  });
  return { project, actor: { isRootAdmin: options.isRootAdmin } };
}

async function keywordsByText(projectId: string) {
  const rows = await prisma.keywordCandidate.findMany({ where: { project_id: projectId } });
  return new Map(rows.map((row) => [row.keyword, row]));
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("DATAFORSEO_LOGIN", `login-${randomBytes(6).toString("hex")}`);
  vi.stubEnv("DATAFORSEO_PASSWORD", randomBytes(12).toString("hex"));
  vi.stubEnv("METRICS_COST_PER_REQUEST_USD", "0.09");
  vi.stubEnv("METRICS_MONTHLY_BUDGET_USD", "10");
  vi.stubEnv("METRICS_RUN_BUDGET_USD", "10");
  resetEnvForTests();
  resetDataForSeoLimiterForTests();
  requestedKeywords.length = 0;
  fetchMock.mockClear();
});

describe("volumi delle keyword del perimetro", () => {
  // covers: AC-6102-1
  it("chiede solo le keyword tenute senza volume e salva volumi e punteggio senza toccare tieni/scarta", async () => {
    const { project, actor } = await createProject({ isRootAdmin: true });

    const outcome = await fillPerimeterVolumes(project, AUTO_SETTINGS, { actor });

    expect(requestedKeywords).toHaveLength(1);
    expect([...requestedKeywords[0]].sort()).toEqual([...VOLUMES.keys()].sort());
    expect(outcome).toMatchObject({ requested: 3, filled: 3, requests: 1 });
    expect(outcome.notice).toBeUndefined();
    const keywords = await keywordsByText(project.id);
    for (const [keyword, volume] of VOLUMES) {
      expect(keywords.get(keyword)).toMatchObject({
        avg_monthly_searches: volume,
        metrics_status: "fetched",
        metrics_provider: "DATAFORSEO",
        metrics_precision: "exact",
        competition: 0.3,
        score_source: "metrics",
      });
      expect(keywords.get(keyword)?.metrics_updated_at).toBeInstanceOf(Date);
      expect(keywords.get(keyword)?.score).not.toBe(40);
    }
    expect(keywords.get("magnetoterapia a casa")).toMatchObject({ avg_monthly_searches: 500, metrics_provider: "PLANNER_CSV", score: 40 });
    expect(keywords.get("magnetoterapia usata")).toMatchObject({ avg_monthly_searches: null, metrics_provider: "NONE", metrics_updated_at: null });
    expect(ROWS.map((row) => keywords.get(row.keyword)?.review_status)).toEqual(ROWS.map((row) => row.review));
  });

  // covers: AC-6102-2
  it("per un MEMBER senza il lancio commerciale non chiama il fornitore e restituisce PLAN_NO_LICENSED_METRICS", async () => {
    const { project, actor } = await createProject({ isRootAdmin: false, role: UserRole.SUBSCRIBER });
    const before = await prisma.keywordCandidate.findMany({ where: { project_id: project.id }, orderBy: { id: "asc" } });

    const outcome = await fillPerimeterVolumes(project, AUTO_SETTINGS, { actor });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ notice: "PLAN_NO_LICENSED_METRICS", requested: 0, filled: 0 });
    expect(await prisma.keywordCandidate.findMany({ where: { project_id: project.id }, orderBy: { id: "asc" } })).toEqual(before);
  });

  // covers: AC-6102-3
  it("con METRICS_RUN_BUDGET_USD a 0 non chiama il fornitore e restituisce RUN_BUDGET_EXCEEDED", async () => {
    vi.stubEnv("METRICS_RUN_BUDGET_USD", "0");
    const { project, actor } = await createProject({ isRootAdmin: true });

    const outcome = await fillPerimeterVolumes(project, AUTO_SETTINGS, { actor });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ notice: "RUN_BUDGET_EXCEEDED", filled: 0 });
    const keywords = await keywordsByText(project.id);
    for (const keyword of VOLUMES.keys()) {
      expect(keywords.get(keyword)).toMatchObject({ avg_monthly_searches: null, metrics_status: "missing" });
    }
  });
});
