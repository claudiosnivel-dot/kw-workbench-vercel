// Gate di T-2502 (AC-2502-1…3): «Rigenera» copia le pagine in scrittura o pubblicate con il loro hub e riorganizza le
// altre con le keyword tenute; oltre 20 strategie elimina la più vecchia, mai il piano; le versioni precedenti sono in
// sola lettura.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchPage } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/route";
import { POST as operate } from "@/app/api/projects/[id]/strategies/[strategyId]/operations/route";
import { POST as generate } from "@/app/api/projects/[id]/strategies/route";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { type FixtureKeyword, insertStrategy, ITALIAN_FIXTURE } from "../helpers/strategy";

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

/** Progetto con la seed e le keyword tenute della fixture italiana di T-1901, come dopo un'estrazione. */
async function projectWithKeywords(session: Session) {
  const project = await prisma.project.create({
    data: { name: "Piano", workspace_id: session.workspaceId, language_code: "it", country_code: "IT" },
  });
  const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
  await prisma.seed.createMany({ data: ITALIAN_FIXTURE.seeds.map((keyword) => ({ project_id: project.id, subproject_id: section.id, keyword })) });
  await addKeywords(project.id, section.id, ITALIAN_FIXTURE.keywords);
  return { projectId: project.id, sectionId: section.id };
}

async function addKeywords(projectId: string, sectionId: string, keywords: FixtureKeyword[]) {
  await prisma.keywordCandidate.createMany({
    data: keywords.map((item) => {
      const canonical = canonicalizeKeyword(item.keyword, "it");
      return {
        project_id: projectId,
        subproject_id: sectionId,
        keyword: item.keyword,
        normalized_keyword: canonical,
        canonical_keyword: canonical,
        source: "MOCK" as const,
        source_query: item.keyword,
        search_intent: item.searchIntent as "mixed",
        keyword_type: item.keywordType as "generic",
        is_question: item.isQuestion ?? false,
        metrics_status: "mock" as const,
        metrics_provider: "MOCK" as const,
        avg_monthly_searches: item.volume,
        score: item.score,
        score_source: "metrics" as const,
      };
    }),
  });
}

async function postGenerate(session: Session, projectId: string, body: unknown) {
  const response = await callRoute(generate, {
    method: "POST",
    url: `/api/projects/${projectId}/strategies`,
    cookie: session.cookie,
    params: { id: projectId },
    body,
  });
  return { status: response.status, id: response.status === 201 ? ((await response.json()) as { data: { id: string } }).data.id : null };
}

function sendPagePatch(session: Session, projectId: string, strategyId: string, pageId: string, body: unknown) {
  return callRoute(patchPage, {
    method: "PATCH",
    url: `/api/projects/${projectId}/strategies/${strategyId}/pages/${pageId}`,
    cookie: session.cookie,
    params: { id: projectId, strategyId, pageId },
    body,
  });
}

/** Pagine di una strategia con la keyword principale e tutte le forme canoniche. */
async function pagesOf(strategyId: string) {
  const pages = await prisma.strategyPage.findMany({
    where: { strategy_id: strategyId },
    select: { id: true, kind: true, hub_page_id: true, h1: true, status: true, keywords: { select: { canonical_keyword: true, role: true } } },
  });
  return pages.map((page) => ({
    ...page,
    main: page.keywords.find((keyword) => keyword.role === "MAIN")!.canonical_keyword,
    canonicals: page.keywords.map((keyword) => keyword.canonical_keyword).sort(),
  }));
}

const extra = (keyword: string, volume: number): FixtureKeyword => ({ keyword, volume, score: 50, searchIntent: "mixed", keywordType: "generic" });

describe("rigenerazione del piano", () => {
  // covers: AC-2502-1
  it("lo spoke in scrittura resta con H1, keyword e stato sotto il suo hub e le keyword nuove formano uno spoke", async () => {
    const owner = await createUserWithSession({ displayName: `t2502-${randomUUID().slice(0, 8)}` });
    const { projectId, sectionId } = await projectWithKeywords(owner);
    const first = await postGenerate(owner, projectId, { mode: "AUTO" });
    const before = await pagesOf(first.id!);
    const spoke = before.find((page) => page.main === "scarpe running offerte")!;
    const pillar = before.find((page) => page.id === spoke.hub_page_id)!;
    expect(pillar.main).toBe("scarpe running");

    const writing = await sendPagePatch(owner, projectId, first.id!, spoke.id, { version: 0, status: "WRITING" });
    const rewritten = await sendPagePatch(owner, projectId, first.id!, spoke.id, { version: 1, h1: "Le nostre offerte di scarpe running" });
    await addKeywords(projectId, sectionId, [extra("scarpe running saldi", 300), extra("scarpe running outlet", 150), extra("fascia cardio", 100)]);
    const second = await postGenerate(owner, projectId, { mode: "AUTO", regenerate: true });

    expect([writing.status, rewritten.status, second.status]).toEqual([200, 200, 201]);
    const after = await pagesOf(second.id!);
    const copied = after.find((page) => page.main === "scarpe running offerte")!;
    const hub = after.find((page) => page.id === copied.hub_page_id)!;
    expect(copied).toMatchObject({ h1: "Le nostre offerte di scarpe running", status: "WRITING", canonicals: spoke.canonicals });
    expect(hub.main).toBe(pillar.main);
    const newSpoke = after.find((page) => page.canonicals.includes("scarpe running saldi"))!;
    expect(newSpoke).toMatchObject({ kind: "SPOKE", hub_page_id: hub.id, canonicals: ["scarpe running outlet", "scarpe running saldi"] });
    const placed = after.flatMap((page) => page.canonicals);
    expect(new Set(placed).size).toBe(placed.length);
    expect(after.filter((page) => page.main === spoke.main)).toHaveLength(1);
  });

  // covers: AC-2502-2
  it("con 20 strategie la rigenerazione risponde 201, elimina la più vecchia e tiene il piano precedente", async () => {
    const owner = await createUserWithSession({ displayName: `t2502-limit-${randomUUID().slice(0, 8)}` });
    const { projectId } = await projectWithKeywords(owner);
    const ids: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const { strategyId } = await insertStrategy({
        projectId,
        name: `Versione ${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, index + 1)),
        pages: [{ key: "hub", kind: "HUB", keywords: [{ text: `pagina ${index}`, volume: 10 }] }],
      });
      ids.push(strategyId);
    }

    const response = await postGenerate(owner, projectId, { mode: "AUTO", regenerate: true });

    expect(response.status).toBe(201);
    expect(await prisma.strategy.count({ where: { project_id: projectId } })).toBe(20);
    expect(await prisma.strategy.count({ where: { id: ids[0] } })).toBe(0);
    expect(await prisma.strategy.count({ where: { id: ids[19] } })).toBe(1);
  });

  // covers: AC-2502-3
  it("su una versione precedente la PATCH di una pagina e move_keywords rispondono 409 STRATEGY_READ_ONLY", async () => {
    const owner = await createUserWithSession({ displayName: `t2502-ro-${randomUUID().slice(0, 8)}` });
    const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId, language_code: "it" } });
    const pages = [
      { key: "hub", kind: "HUB" as const, keywords: [{ text: "scarpe running", volume: 900 }, { text: "scarpa running", volume: 90 }] },
    ];
    const version = await insertStrategy({ projectId: project.id, pages, createdAt: new Date("2026-01-01") });
    await insertStrategy({ projectId: project.id, pages, createdAt: new Date("2026-02-01") });

    const patch = await sendPagePatch(owner, project.id, version.strategyId, version.pageIds.hub, { version: 0, h1: "Nuovo titolo" });
    const move = await callRoute(operate, {
      method: "POST",
      url: `/api/projects/${project.id}/strategies/${version.strategyId}/operations`,
      cookie: owner.cookie,
      params: { id: project.id, strategyId: version.strategyId },
      body: { version: 0, operation: { type: "move_keywords", keywordIds: [version.keywordIds["scarpa running"]], targetPageId: null } },
    });

    expect([patch.status, move.status]).toEqual([409, 409]);
    expect(((await patch.json()) as { code: string }).code).toBe("STRATEGY_READ_ONLY");
    expect(((await move.json()) as { code: string }).code).toBe("STRATEGY_READ_ONLY");
    const unchanged = await prisma.strategy.findUniqueOrThrow({
      where: { id: version.strategyId },
      select: { version: true, pages: { select: { h1: true } }, keywords: { select: { page_id: true } } },
    });
    expect(unchanged.version).toBe(0);
    expect(unchanged.pages).toEqual([{ h1: "H1 hub" }]);
    expect(unchanged.keywords.every((keyword) => keyword.page_id === version.pageIds.hub)).toBe(true);
  });
});
