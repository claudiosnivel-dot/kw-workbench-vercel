// Gate di T-2601 (AC-2601-1…3): marchi dei concorrenti del progetto modificabili dall'API. Aggiungere un marchio scarta
// subito le keyword già trovate che lo contengono a parola intera; toglierlo le riporta allowed senza cambiare la scelta
// tieni/scarta; un marchio doppio è 409 BRAND_EXISTS; fuori dal workspace 404; un marchio oltre 100 caratteri è 400.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteBrand } from "@/app/api/projects/[id]/brands/[brandId]/route";
import { GET as listBrands, POST as addBrand } from "@/app/api/projects/[id]/brands/route";
import type { ReviewStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

async function brandProject() {
  const owner = await createUserWithSession({ displayName: `t2601-${randomUUID().slice(0, 8)}` });
  const project = await prisma.project.create({
    data: { name: "Scarpe", workspace_id: owner.workspaceId, language_code: "it", country_code: "IT", exclude_brands: true },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Running", position: 0 } });
  const keywords: [string, ReviewStatus][] = [
    ["nike pegasus", "pending"],
    ["scarpe nike", "approved"],
    ["scarpe running", "pending"],
  ];
  await prisma.keywordCandidate.createMany({
    data: keywords.map(([keyword, review_status]) => ({
      project_id: project.id,
      subproject_id: section.id,
      keyword,
      normalized_keyword: keyword,
      canonical_keyword: keyword,
      source: "seed",
      source_query: keyword,
      review_status,
    })),
  });
  return { owner, projectId: project.id };
}

function post(projectId: string, cookie: string, brand: string) {
  return callRoute(addBrand, { method: "POST", url: `/api/projects/${projectId}/brands`, cookie, params: { id: projectId }, body: { brand } });
}

function list(projectId: string, cookie: string) {
  return callRoute(listBrands, { url: `/api/projects/${projectId}/brands`, cookie, params: { id: projectId } });
}

async function keywordStates(projectId: string) {
  const rows = await prisma.keywordCandidate.findMany({
    where: { project_id: projectId },
    select: { keyword: true, brand_status: true, review_status: true },
  });
  return Object.fromEntries(rows.map((row) => [row.keyword, { brand: row.brand_status, review: row.review_status }]));
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

describe("marchi dei concorrenti del progetto", () => {
  // covers: AC-2601-1
  it("aggiungere un marchio scarta subito le keyword in attesa che lo contengono e lascia le altre scelte", async () => {
    const { owner, projectId } = await brandProject();

    const response = await post(projectId, owner.cookie, "nike");

    expect(response.status).toBe(201);
    expect(await keywordStates(projectId)).toEqual({
      "nike pegasus": { brand: "excluded", review: "rejected" },
      "scarpe nike": { brand: "excluded", review: "approved" },
      "scarpe running": { brand: "allowed", review: "pending" },
    });
  });

  // covers: AC-2601-2
  it("togliere il marchio riporta le keyword allowed senza cambiare la scelta; un marchio doppio è 409 BRAND_EXISTS", async () => {
    const { owner, projectId } = await brandProject();
    const added = await post(projectId, owner.cookie, "nike");
    const brandId = ((await added.json()) as { data: { id: string } }).data.id;

    const removed = await callRoute(deleteBrand, {
      method: "DELETE",
      url: `/api/projects/${projectId}/brands/${brandId}`,
      cookie: owner.cookie,
      params: { id: projectId, brandId },
    });
    const afterDelete = await prisma.keywordCandidate.findFirstOrThrow({
      where: { project_id: projectId, keyword: "nike pegasus" },
      select: { brand_status: true, brand_reason: true, review_status: true },
    });
    const first = await post(projectId, owner.cookie, "nike");
    const second = await post(projectId, owner.cookie, "nike");

    expect(removed.status).toBe(200);
    expect(afterDelete).toEqual({ brand_status: "allowed", brand_reason: null, review_status: "rejected" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "BRAND_EXISTS" });
  });

  // covers: AC-2601-3
  it("fuori dal workspace GET e POST sono 404; un marchio di 101 caratteri è 400 e la lista non cambia", async () => {
    const { owner, projectId } = await brandProject();
    const outsider = await createUserWithSession({ displayName: `t2601-out-${randomUUID().slice(0, 8)}` });
    const member = await createUserWithSession({ displayName: `t2601-mem-${randomUUID().slice(0, 8)}` });
    await prisma.membership.create({ data: { workspace_id: owner.workspaceId, user_id: member.user.id, role: "MEMBER" } });
    // Le righe globali (project_id null) restano fuori dall'API.
    await prisma.brandBlacklist.create({ data: { project_id: null, brand: "adidas" } });

    const outsiderGet = await list(projectId, outsider.cookie);
    const outsiderPost = await post(projectId, outsider.cookie, "nike");
    const tooLong = await post(projectId, member.cookie, "n".repeat(101));
    const memberList = await list(projectId, member.cookie);

    expect(outsiderGet.status).toBe(404);
    expect(outsiderPost.status).toBe(404);
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(memberList.status).toBe(200);
    expect(await memberList.json()).toEqual({ data: [] });
    expect(await prisma.brandBlacklist.count({ where: { project_id: projectId } })).toBe(0);
  });
});
