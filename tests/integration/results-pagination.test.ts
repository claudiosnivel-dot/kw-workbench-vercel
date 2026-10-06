// Gate di T-801 (AC-801-3, AC-801-4): la paginazione dei risultati è stabile a parità di punteggio e
// keyword (tiebreaker su id) e loadResultsPage esegue 2 count e la findMany in parallelo, ripetendo
// solo la findMany quando la pagina richiesta supera l'ultima.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadResultsPage } from "@/lib/modules/results-query";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

async function createProject(username: string) {
  const owner = await createUserWithSession({ username });
  const project = await prisma.project.create({
    data: { name: "Paginazione", owner_user_id: owner.user.id, language_code: "it", country_code: "IT" },
  });
  return { cookie: owner.cookie, projectId: project.id };
}

function candidate(projectId: string, subprojectId: string, keyword: string, score: number) {
  return {
    project_id: projectId,
    subproject_id: subprojectId,
    keyword,
    normalized_keyword: keyword,
    canonical_keyword: keyword,
    source: "seed",
    source_query: keyword,
    score,
  };
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("paginazione stabile a parità di punteggio e keyword", () => {
  // covers: AC-801-3
  // impacted-by: T-1101 (GET /api/projects/[id]/results rimossa: la paginazione si legge da loadResultsPage)
  it("6 pagine da 20 della vista progetto coprono 120 id distinti", async () => {
    const { projectId } = await createProject("t801-stable");
    const sectionA = await prisma.subproject.create({ data: { project_id: projectId, name: "A", position: 0 } });
    const sectionB = await prisma.subproject.create({ data: { project_id: projectId, name: "B", position: 1 } });
    const keywords = Array.from({ length: 60 }, (_, index) => `kw-${String(index + 1).padStart(3, "0")}`);
    await prisma.keywordCandidate.createMany({
      data: [
        ...keywords.map((keyword) => candidate(projectId, sectionA.id, keyword, 50)),
        ...keywords.map((keyword) => candidate(projectId, sectionB.id, keyword, 50)),
      ],
    });

    const readIds: string[] = [];
    let totalPages = 0;
    for (let page = 1; page <= 6; page += 1) {
      const result = await loadResultsPage({ projectId, subprojectId: null, filters: {}, page, pageSize: 20 });
      readIds.push(...result.rows.map((row) => row.id));
      totalPages = result.totalPages;
    }

    expect(readIds).toHaveLength(120);
    expect(new Set(readIds).size).toBe(120);
    expect(totalPages).toBe(6);
  });
});

describe("query della pagina dei risultati", () => {
  // covers: AC-801-4
  it("2 count e 1 findMany per una pagina valida; oltre l'ultima ripete solo la findMany", async () => {
    const { projectId } = await createProject("t801-queries");
    const section = await prisma.subproject.create({ data: { project_id: projectId, name: "Generale", position: 0 } });
    await prisma.keywordCandidate.createMany({
      data: Array.from({ length: 205 }, (_, index) =>
        candidate(projectId, section.id, `scarpe ${String(index).padStart(3, "0")}`, index % 7)
      ),
    });
    const filters = { searchText: "scarpe" };
    const count = vi.spyOn(prisma.keywordCandidate, "count");
    const findMany = vi.spyOn(prisma.keywordCandidate, "findMany");

    const second = await loadResultsPage({ projectId, subprojectId: section.id, filters, page: 2, pageSize: 100 });

    expect(count).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(second.rows).toHaveLength(100);

    count.mockClear();
    findMany.mockClear();
    const beyond = await loadResultsPage({ projectId, subprojectId: section.id, filters, page: 99, pageSize: 100 });

    expect(beyond.page).toBe(3);
    expect(beyond.totalPages).toBe(3);
    expect(beyond.rows).toHaveLength(5);
    expect(beyond.pageStart).toBe(201);
    expect(beyond.pageEnd).toBe(205);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
