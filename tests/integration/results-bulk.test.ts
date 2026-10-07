// Gate di T-803 (AC-803-1, AC-803-2): l'azione massiva può coprire l'intero set filtrato della vista,
// sempre dentro il progetto posseduto, e il payload è validato (azione in whitelist, ids tipizzati e
// limitati, esattamente uno tra ids e filters).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchResults } from "@/app/api/projects/[id]/results/route";
import type { ReviewStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

async function createSection(ownerId: string, name: string) {
  const project = await prisma.project.create({
    data: { name, workspace_id: await personalWorkspaceId(ownerId), language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "S1", position: 0 } });
  return { projectId: project.id, sectionId: section.id };
}

async function addCandidates(
  target: { projectId: string; sectionId: string },
  prefix: string,
  count: number,
  review_status: ReviewStatus
) {
  await prisma.keywordCandidate.createMany({
    data: Array.from({ length: count }, (_, index) => {
      const keyword = `${prefix} ${String(index).padStart(4, "0")}`;
      return {
        project_id: target.projectId,
        subproject_id: target.sectionId,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "seed",
        source_query: keyword,
        review_status,
      };
    }),
  });
}

async function reviewStatusById(projectId: string): Promise<Map<string, ReviewStatus>> {
  const rows = await prisma.keywordCandidate.findMany({
    where: { project_id: projectId },
    select: { id: true, review_status: true },
  });
  return new Map(rows.map((row) => [row.id, row.review_status]));
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

describe("azione massiva sul set filtrato", () => {
  // covers: AC-803-1
  it("approva le 300 righe filtrate della sezione e lascia invariate le altre e il progetto Q", async () => {
    const owner = await createUserWithSession({ displayName: "t803-owner" });
    const p = await createSection(owner.user.id, "P");
    const q = await createSection(owner.user.id, "Q");
    await addCandidates(p, "scarpe running", 300, "pending");
    await addCandidates(p, "borsa pelle", 434, "pending");
    await addCandidates(p, "scarpe trail", 500, "rejected");
    await addCandidates(q, "scarpe running", 50, "pending");
    const before = await reviewStatusById(p.projectId);

    const response = await callRoute(patchResults, {
      method: "PATCH",
      url: `/api/projects/${p.projectId}/results`,
      cookie: owner.cookie,
      params: { id: p.projectId },
      body: { action: "approve", filters: { reviewStatus: "pending", searchText: "scarpe" }, subprojectId: p.sectionId },
    });

    const after = await reviewStatusById(p.projectId);
    const changed = [...after].filter(([id, status]) => before.get(id) !== status);
    const unchanged = [...after].filter(([id, status]) => before.get(id) === status);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, updated: 300 });
    expect(before.size).toBe(1234);
    expect(changed).toHaveLength(300);
    expect(changed.every(([id, status]) => status === "approved" && before.get(id) === "pending")).toBe(true);
    expect(unchanged).toHaveLength(934);
    expect(await prisma.keywordCandidate.count({ where: { project_id: q.projectId, review_status: "pending" } })).toBe(50);
  });
});

describe("validazione del payload", () => {
  // covers: AC-803-2
  it("rifiuta con 400 ids oltre 1000, ids non stringhe, azione ignota e body senza ids né filters", async () => {
    const owner = await createUserWithSession({ displayName: "t803-validation" });
    const p = await createSection(owner.user.id, "P");
    await addCandidates(p, "scarpe", 20, "pending");
    await addCandidates(p, "borsa", 5, "approved");
    const ids = (await prisma.keywordCandidate.findMany({ where: { project_id: p.projectId }, select: { id: true } })).map(
      (row) => row.id
    );
    const bodies = [
      { action: "approve", ids: Array.from({ length: 1001 }, (_, index) => ids[index % ids.length]) },
      { action: "approve", ids: [123, null] },
      { action: "delete", ids },
      { action: "approve" },
    ];

    const statuses: number[] = [];
    for (const body of bodies) {
      const response = await callRoute(patchResults, {
        method: "PATCH",
        url: `/api/projects/${p.projectId}/results`,
        cookie: owner.cookie,
        params: { id: p.projectId },
        body,
      });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([400, 400, 400, 400]);
    expect(await prisma.keywordCandidate.count({ where: { project_id: p.projectId, review_status: "approved" } })).toBe(5);
  });
});
