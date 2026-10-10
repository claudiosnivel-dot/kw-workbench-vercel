// Gate di T-1903 (AC-1903-1…5): generazione automatica ed esperta con il perimetro giusto, autorizzazione per
// workspace, limiti di D-35 (20 strategie, 5000 keyword) e validazione delle regole.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listStrategies, POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import {
  DELETE as deleteStrategy,
  GET as getStrategy,
  PATCH as renameStrategy,
} from "@/app/api/projects/[id]/strategies/[strategyId]/route";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type Session = Awaited<ReturnType<typeof createUserWithSession>>;
type KeywordData = Partial<Prisma.KeywordCandidateCreateManyInput> & { keyword: string };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

/** Workspace di squadra W con OWNER e MEMBER e il progetto P con una sezione. */
async function teamProject() {
  const owner = await createUserWithSession({ displayName: "t1903-owner" });
  const member = await createUserWithSession({ displayName: "t1903-member" });
  const workspace = await prisma.workspace.create({ data: { name: "W", slug: "ws-t1903" } });
  await prisma.membership.createMany({
    data: [
      { workspace_id: workspace.id, user_id: owner.user.id, role: "OWNER" },
      { workspace_id: workspace.id, user_id: member.user.id, role: "MEMBER" },
    ],
  });
  const project = await prisma.project.create({ data: { name: "P", workspace_id: workspace.id, language_code: "it" } });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "S1", position: 0 } });
  return { owner, member, workspaceId: workspace.id, projectId: project.id, sectionId: section.id };
}

async function insertKeywords(projectId: string, sectionId: string, rows: KeywordData[]) {
  await prisma.keywordCandidate.createMany({
    data: rows.map((row) => ({
      project_id: projectId,
      subproject_id: sectionId,
      normalized_keyword: row.keyword,
      canonical_keyword: row.keyword,
      source: "seed",
      source_query: row.keyword,
      ...row,
    })),
  });
}

function generate(session: Session, projectId: string, body: unknown) {
  return callRoute(createStrategy, {
    method: "POST",
    url: `/api/projects/${projectId}/strategies`,
    cookie: session.cookie,
    params: { id: projectId },
    body,
  });
}

async function strategyKeywords(strategyId: string): Promise<string[]> {
  const rows = await prisma.strategyKeyword.findMany({ where: { strategy_id: strategyId }, select: { canonical_keyword: true } });
  return rows.map((row) => row.canonical_keyword).sort();
}

async function emptyStrategies(projectId: string, count: number) {
  await prisma.strategy.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      project_id: projectId,
      name: `Strategia ${index + 1}`,
      mode: "AUTO" as const,
      settings: {},
      language: "it",
      considered_count: 0,
      assigned_count: 0,
      unassigned_count: 0,
    })),
  });
}

describe("API delle strategie", () => {
  // covers: AC-1903-1
  it("in modalità automatica un MEMBER genera una strategia con le keyword approvate e da rivedere", async () => {
    const { member, projectId, sectionId } = await teamProject();
    await insertKeywords(projectId, sectionId, [
      { keyword: "scarpe running", review_status: "approved", avg_monthly_searches: 9900 },
      { keyword: "scarpe running donna", review_status: "pending", avg_monthly_searches: 2100 },
      { keyword: "scarpe running uomo", review_status: "rejected", avg_monthly_searches: 1600 },
      { keyword: "scarpe running nike", brand_status: "excluded", avg_monthly_searches: 1300 },
      { keyword: "calzini tecnici", review_status: "approved", avg_monthly_searches: 300 },
    ]);
    await prisma.seed.create({ data: { project_id: projectId, subproject_id: sectionId, keyword: "scarpe running" } });

    const response = await generate(member, projectId, { mode: "AUTO" });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { id: string } };
    expect(await strategyKeywords(data.id)).toEqual(["calzini tecnici", "scarpe running", "scarpe running donna"]);
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: data.id } });
    expect(strategy.mode).toBe("AUTO");
    expect(strategy.created_by_user_id).toBe(member.user.id);
    expect(strategy.considered_count).toBe(strategy.assigned_count + strategy.unassigned_count);
    expect(strategy.considered_count).toBe(3);
    expect(strategy.unassigned_count).toBe(1);
  });

  // covers: AC-1903-2
  it("un utente di un altro workspace riceve 404 su ogni rotta e la strategia di un altro progetto è STRATEGY_NOT_FOUND", async () => {
    const { member, workspaceId, projectId, sectionId } = await teamProject();
    const outsider = await createUserWithSession({ displayName: "t1903-outsider" });
    await insertKeywords(projectId, sectionId, [{ keyword: "scarpe running", avg_monthly_searches: 100 }]);
    const created = await generate(member, projectId, { mode: "AUTO" });
    const { data } = (await created.json()) as { data: { id: string } };
    const otherProject = await prisma.project.create({ data: { name: "P2", workspace_id: workspaceId } });

    const itemParams = { id: projectId, strategyId: data.id };
    const itemUrl = `/api/projects/${projectId}/strategies/${data.id}`;
    const responses = [
      await generate(outsider, projectId, { mode: "AUTO" }),
      await callRoute(listStrategies, { url: `/api/projects/${projectId}/strategies`, cookie: outsider.cookie, params: { id: projectId } }),
      await callRoute(getStrategy, { url: itemUrl, cookie: outsider.cookie, params: itemParams }),
      await callRoute(renameStrategy, { method: "PATCH", url: itemUrl, cookie: outsider.cookie, params: itemParams, body: { name: "X", version: 0 } }),
      await callRoute(deleteStrategy, { method: "DELETE", url: itemUrl, cookie: outsider.cookie, params: itemParams }),
    ];
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    expect(await prisma.strategy.count({ where: { id: data.id } })).toBe(1);

    const crossed = await callRoute(getStrategy, {
      url: `/api/projects/${otherProject.id}/strategies/${data.id}`,
      cookie: member.cookie,
      params: { id: otherProject.id, strategyId: data.id },
    });
    expect(crossed.status).toBe(404);
    expect(((await crossed.json()) as { code: string }).code).toBe("STRATEGY_NOT_FOUND");
  });

  // covers: AC-1903-3
  it("20 strategie, nessuna keyword o regole fuori dai limiti: 409 o 400 e nessuna strategia nuova", async () => {
    const { member, workspaceId, projectId, sectionId } = await teamProject();
    await insertKeywords(projectId, sectionId, [{ keyword: "scarpe running", avg_monthly_searches: 100 }]);
    await emptyStrategies(projectId, 20);
    const emptyProject = await prisma.project.create({ data: { name: "Vuoto", workspace_id: workspaceId } });

    const full = await generate(member, projectId, { mode: "AUTO" });
    const empty = await generate(member, emptyProject.id, { mode: "AUTO" });
    const invalid = await generate(member, emptyProject.id, { mode: "EXPERT", settings: { rules: { maxSpokesPerHub: 0 } } });

    expect([full.status, empty.status, invalid.status]).toEqual([409, 409, 400]);
    expect(((await full.json()) as { code: string }).code).toBe("STRATEGY_LIMIT");
    expect(((await empty.json()) as { code: string }).code).toBe("STRATEGY_NO_KEYWORDS");
    expect(((await invalid.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect(await prisma.strategy.count({ where: { project_id: projectId } })).toBe(20);
    expect(await prisma.strategy.count({ where: { project_id: emptyProject.id } })).toBe(0);
  });

  // covers: AC-1903-4
  it("con 5003 keyword si prendono le 5000 più cercate e la strategia è troncata", async () => {
    const { member, projectId, sectionId } = await teamProject();
    await insertKeywords(
      projectId,
      sectionId,
      Array.from({ length: 5003 }, (_, index) => ({
        keyword: `keyword di prova ${String(index).padStart(4, "0")}`,
        avg_monthly_searches: 10 + index,
      }))
    );

    const response = await generate(member, projectId, { mode: "AUTO" });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { id: string } };
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: data.id } });
    expect(strategy.considered_count).toBe(5000);
    expect(strategy.truncated).toBe(true);
    const saved = new Set(await strategyKeywords(data.id));
    expect(saved.size).toBe(5000);
    expect(["0000", "0001", "0002"].map((suffix) => saved.has(`keyword di prova ${suffix}`))).toEqual([false, false, false]);
  }, 60_000);

  // covers: AC-1903-5
  it("in modalità esperta il perimetro è la sezione scelta, solo approvate e con il volume minimo", async () => {
    const { member, projectId, sectionId } = await teamProject();
    const other = await prisma.subproject.create({ data: { project_id: projectId, name: "S2", position: 1 } });
    for (const [id, prefix] of [[sectionId, "uno"], [other.id, "due"]] as const) {
      await insertKeywords(projectId, id, [
        { keyword: `${prefix} approvata alta`, review_status: "approved", avg_monthly_searches: 500 },
        { keyword: `${prefix} approvata soglia`, review_status: "approved", avg_monthly_searches: 100 },
        { keyword: `${prefix} approvata bassa`, review_status: "approved", avg_monthly_searches: 50 },
        { keyword: `${prefix} da rivedere alta`, review_status: "pending", avg_monthly_searches: 800 },
      ]);
    }

    const response = await generate(member, projectId, {
      mode: "EXPERT",
      settings: { sectionId, reviewStatus: "approved", minVolume: 100 },
    });

    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: { id: string } };
    expect(await strategyKeywords(data.id)).toEqual(["uno approvata alta", "uno approvata soglia"]);
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: data.id } });
    expect(strategy.mode).toBe("EXPERT");
    expect(strategy.settings).toMatchObject({ sectionId, reviewStatus: "approved", minVolume: 100 });
  });

  it("rinomina con la version corrente, 409 con una version superata, ed elimina", async () => {
    const { member, projectId, sectionId } = await teamProject();
    await insertKeywords(projectId, sectionId, [{ keyword: "scarpe running", avg_monthly_searches: 100 }]);
    const { data } = (await (await generate(member, projectId, { mode: "AUTO" })).json()) as { data: { id: string } };
    const params = { id: projectId, strategyId: data.id };
    const url = `/api/projects/${projectId}/strategies/${data.id}`;

    const renamed = await callRoute(renameStrategy, { method: "PATCH", url, cookie: member.cookie, params, body: { name: "Piano Q4", version: 0 } });
    const stale = await callRoute(renameStrategy, { method: "PATCH", url, cookie: member.cookie, params, body: { name: "Vecchio", version: 0 } });
    const listed = await callRoute(listStrategies, { url: `/api/projects/${projectId}/strategies`, cookie: member.cookie, params: { id: projectId } });

    expect(renamed.status).toBe(200);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { code: string }).code).toBe("STRATEGY_CONFLICT");
    expect(((await listed.json()) as { data: { name: string; version: number }[] }).data).toMatchObject([{ name: "Piano Q4", version: 1 }]);

    const deleted = await callRoute(deleteStrategy, { method: "DELETE", url, cookie: member.cookie, params });
    expect(deleted.status).toBe(200);
    expect(await prisma.strategy.count({ where: { project_id: projectId } })).toBe(0);
  });
});
