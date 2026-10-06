// Gate di T-1103 (AC-1103-1…4): indici per l'ordinamento dei risultati, unicità delle righe globali di brand e
// pattern, schema allineato alle migrazioni e default reale del provider di autocomplete.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadResultsPage } from "@/lib/modules/results-query";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import type { QueryCounter } from "../helpers/query-counter";

const shared = vi.hoisted(() => ({ counter: null as QueryCounter | null }));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/prisma")>();
  const { createQueryCounter } = await import("../helpers/query-counter");
  shared.counter = createQueryCounter(original.buildPoolConfig());
  return { ...original, prisma: shared.counter.client };
});

const require = createRequire(import.meta.url);
const PROJECT_ORDER_INDEX = "keyword_candidates_results_order_project_idx";
const CANDIDATES = 10_000;

type PlanNode = { "Node Type": string; "Index Name"?: string; Plans?: PlanNode[] };
type DriverAdapterFailure = { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };

function counter(): QueryCounter {
  if (!shared.counter) {
    throw new Error("client Prisma con il contatore non installato");
  }
  return shared.counter;
}

function planNodes(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(planNodes)];
}

async function seedCandidates(): Promise<string> {
  const user = await prisma.user.create({ data: { username: "indici", password_hash: "x" } });
  const project = await prisma.project.create({
    data: { name: "Indici", owner_user_id: user.id, language_code: "it", country_code: "IT", autocomplete_provider: "MOCK" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });

  const rows: Prisma.KeywordCandidateCreateManyInput[] = Array.from({ length: CANDIDATES }, (_, index) => {
    const keyword = `keyword ${String(index).padStart(5, "0")}`;
    return {
      project_id: project.id,
      subproject_id: section.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
      score: index % 7 === 0 ? null : (index * 37) % 1000,
      score_source: index % 3 === 0 ? "metrics" : "heuristic",
    };
  });
  for (let start = 0; start < rows.length; start += 2_000) {
    await prisma.keywordCandidate.createMany({ data: rows.slice(start, start + 2_000) });
  }
  await prisma.$executeRawUnsafe("ANALYZE keyword_candidates");
  return project.id;
}

async function postgresCodeOf(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write;
  } catch (error) {
    return (error as DriverAdapterFailure).meta?.driverAdapterError?.cause?.originalCode;
  }
  return undefined;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("indici e schema (T-1103)", () => {
  // covers: AC-1103-1
  it("la query di pagina di T-801 su tutto il progetto usa il nuovo indice senza nodo Sort", async () => {
    const projectId = await seedCandidates();
    counter().reset();

    // La query è quella reale di loadResultsPage, catturata dall'evento query di Prisma.
    const page = await loadResultsPage({ projectId, subprojectId: null, filters: {}, page: 1, pageSize: 100 });
    expect(page.rows).toHaveLength(100);

    const [pageQuery] = counter()
      .statements("keyword_candidates", "SELECT")
      .filter((statement) => /ORDER BY/i.test(statement.query) && /LIMIT/i.test(statement.query));
    expect(pageQuery).toBeDefined();

    const params = JSON.parse(pageQuery.params) as unknown[];
    const [explained] = await prisma.$queryRawUnsafe<{ "QUERY PLAN": [{ Plan: PlanNode }] }[]>(
      `EXPLAIN (FORMAT JSON) ${pageQuery.query}`,
      ...params
    );
    const nodes = planNodes(explained["QUERY PLAN"][0].Plan);

    expect(nodes.some((node) => node["Node Type"] === "Index Scan" && node["Index Name"] === PROJECT_ORDER_INDEX)).toBe(true);
    expect(nodes.filter((node) => node["Node Type"].includes("Sort"))).toEqual([]);
  }, 120_000);

  // covers: AC-1103-2
  it("una seconda riga globale di brand_blacklist con lo stesso brand fallisce con 23505", async () => {
    await prisma.$executeRaw`INSERT INTO brand_blacklist (id, project_id, brand) VALUES ('globale-1', NULL, 'acme')`;

    const code = await postgresCodeOf(
      prisma.$executeRaw`INSERT INTO brand_blacklist (id, project_id, brand) VALUES ('globale-2', NULL, 'acme')`
    );

    expect(code).toBe("23505");
    expect(await prisma.brandBlacklist.count({ where: { project_id: null, brand: "acme" } })).toBe(1);
  });

  it("una seconda riga globale di expansion_patterns con lo stesso pattern fallisce con 23505", async () => {
    await prisma.$executeRaw`INSERT INTO expansion_patterns (id, project_id, pattern) VALUES ('globale-1', NULL, 'come {seed}')`;

    const code = await postgresCodeOf(
      prisma.$executeRaw`INSERT INTO expansion_patterns (id, project_id, pattern) VALUES ('globale-2', NULL, 'come {seed}')`
    );

    expect(code).toBe("23505");
    expect(await prisma.expansionPattern.count({ where: { project_id: null, pattern: "come {seed}" } })).toBe(1);
  });

  // covers: AC-1103-3
  it("users_single_root_admin_idx c'è, gli indici ridondanti no e lo schema non diverge dalle migrazioni", async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const names = indexes.map((row) => row.indexname);
    expect(names).toContain("users_single_root_admin_idx");
    // Rimossi su decisione dell'utente (2026-10-06): il primo duplica l'unique su user_id.
    for (const removed of ["google_sheets_credentials_user_id_idx", "users_role_idx", "users_status_idx"]) {
      expect(names).not.toContain(removed);
    }

    // Il DB di test è migrato da migrate deploy (global setup): il diff verso lo schema deve essere vuoto.
    const diff = spawnSync(
      process.execPath,
      [require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
      { env: { ...process.env, DIRECT_URL: process.env.TEST_DATABASE_URL }, encoding: "utf8", timeout: 120_000 }
    );
    expect(diff.stdout).toContain("No difference detected");
    expect(diff.status).toBe(0);
  }, 120_000);

  // covers: AC-1103-4
  it("un progetto creato senza autocomplete_provider ha GOOGLE_DIRECT", async () => {
    const project = await prisma.project.create({ data: { name: "Default" } });

    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { autocomplete_provider: true } });
    expect(saved.autocomplete_provider).toBe("GOOGLE_DIRECT");
  });
});
