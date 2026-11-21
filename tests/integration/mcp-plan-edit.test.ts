// Gate di T-7502 (AC-7502-1…4, D-64): Claude Code modifica il piano con edit_plan e update_page passando la version, ma
// non può togliere keyword, unire, spostare o ritoccare le pagine che non sono «Da scrivere» (AGENT_PAGE_LOCKED, piano e
// version invariati); su quelle cambia solo stato e indirizzo pubblicato. Un conflitto di version dà la version
// corrente; delete_page non esiste. In più le altre operazioni bloccate e quelle permesse.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyPageStatus } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "../helpers/db";
import { callTool, rootAdminWithKey } from "../helpers/mcp";
import { insertStrategy } from "../helpers/strategy";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

type Root = Awaited<ReturnType<typeof rootAdminWithKey>>;

const A_MAIN = "noleggio magnetoterapia costo";
const A_SECOND = "noleggio magnetoterapia prezzi";
const B_MAIN = "magnetoterapia farmacia";
const B_SECOND = "magnetoterapia farmacia vicino a me";

/**
 * Piano del root admin con l'hub da scrivere, lo spoke A da scrivere e lo spoke B nello stato indicato sotto lo stesso
 * hub, alla version 3; un secondo hub con il suo spoke da scrivere per gli spostamenti.
 */
async function lockedPlan(root: Root, bStatus: StrategyPageStatus) {
  const project = await prisma.project.create({ data: { name: "Noleggio magnetoterapia", workspace_id: root.workspaceId } });
  const plan = await insertStrategy({
    projectId: project.id,
    version: 3,
    pages: [
      { key: "hub", kind: "HUB", keywords: [{ text: "noleggio magnetoterapia", volume: 900 }] },
      { key: "a", kind: "SPOKE", hub: "hub", keywords: [{ text: A_MAIN, volume: 200 }, { text: A_SECOND, volume: 90 }], h1: "H1 di A" },
      { key: "b", kind: "SPOKE", hub: "hub", keywords: [{ text: B_MAIN, volume: 70 }, { text: B_SECOND, volume: 20 }], h1: "H1 di B", status: bStatus },
      { key: "hub2", kind: "HUB", keywords: [{ text: "magnetoterapia", volume: 500 }] },
      { key: "c", kind: "SPOKE", hub: "hub2", keywords: [{ text: "magnetoterapia cavalli", volume: 40 }] },
    ],
  });
  return { projectId: project.id, ...plan };
}

type Plan = Awaited<ReturnType<typeof lockedPlan>>;

const editPlan = (root: Root, plan: Plan, version: number, operation: Record<string, unknown>) =>
  callTool(root.key, "edit_plan", { projectId: plan.projectId, version, operation });

/** Stato salvato: version della strategia e pagina di ogni keyword per testo. */
async function saved(plan: Plan) {
  const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: plan.strategyId }, select: { version: true } });
  const keywords = await prisma.strategyKeyword.findMany({ where: { strategy_id: plan.strategyId }, select: { keyword: true, page_id: true } });
  const pages = await prisma.strategyPage.findMany({ where: { strategy_id: plan.strategyId }, select: { id: true, kind: true, hub_page_id: true, h1: true } });
  return { version: strategy.version, pageOf: Object.fromEntries(keywords.map((keyword) => [keyword.keyword, keyword.page_id])), pages };
}

describe("edit_plan con le pagine iniziate protette", () => {
  // covers: AC-7502-1
  it("merge_pages da B in scrittura ad A e move_keywords di una keyword di B sono AGENT_PAGE_LOCKED e il piano resta alla version 3", async () => {
    const root = await rootAdminWithKey("t7502-locked");
    const plan = await lockedPlan(root, "WRITING");
    const before = await saved(plan);

    const merged = await editPlan(root, plan, 3, { type: "merge_pages", sourcePageId: plan.pageIds.b, targetPageId: plan.pageIds.a });
    const moved = await editPlan(root, plan, 3, { type: "move_keywords", keywordIds: [plan.keywordIds[B_SECOND]], targetPageId: plan.pageIds.a });

    for (const reply of [merged, moved]) {
      expect(reply.result?.isError).toBe(true);
      expect(reply.data).toMatchObject({ code: "AGENT_PAGE_LOCKED", pageId: plan.pageIds.b });
      expect(String(reply.data?.message)).toContain("Da scrivere");
    }
    const after = await saved(plan);
    expect(after.version).toBe(3);
    expect(after.pageOf).toEqual(before.pageOf);
    expect(after.pages).toHaveLength(5);
    const calls = await prisma.agentCall.findMany({ where: { tool: "edit_plan" }, select: { ok: true, error_code: true, project_id: true } });
    expect(calls).toEqual([
      { ok: false, error_code: "AGENT_PAGE_LOCKED", project_id: plan.projectId },
      { ok: false, error_code: "AGENT_PAGE_LOCKED", project_id: plan.projectId },
    ]);
  });

  // covers: AC-7502-2
  it("move_keywords da A verso B in scrittura risponde con la version 4; una seconda operazione con la version 3 è STRATEGY_CONFLICT con la 4", async () => {
    const root = await rootAdminWithKey("t7502-conflict");
    const plan = await lockedPlan(root, "WRITING");

    const moved = await editPlan(root, plan, 3, { type: "move_keywords", keywordIds: [plan.keywordIds[A_SECOND]], targetPageId: plan.pageIds.b });
    const stale = await editPlan(root, plan, 3, { type: "keep_angle", keywordIds: [plan.keywordIds[A_MAIN]] });

    expect(moved.result?.isError).not.toBe(true);
    expect(moved.data).toEqual({ strategyId: plan.strategyId, version: 4 });
    expect((await saved(plan)).pageOf[A_SECOND]).toBe(plan.pageIds.b);
    expect(stale.result?.isError).toBe(true);
    expect(stale.data).toMatchObject({ code: "STRATEGY_CONFLICT", currentVersion: 4 });
    expect((await saved(plan)).version).toBe(4);
  });

  // covers: AC-7502-4
  it("delete_page è VALIDATION_ERROR e nessuna pagina va via", async () => {
    const root = await rootAdminWithKey("t7502-delete");
    const plan = await lockedPlan(root, "TODO");

    const reply = await editPlan(root, plan, 3, { type: "delete_page", pageId: plan.pageIds.a });

    expect(reply.result?.isError).toBe(true);
    expect(reply.data).toMatchObject({ code: "VALIDATION_ERROR" });
    const after = await saved(plan);
    expect(after.pages).toHaveLength(5);
    expect(after.version).toBe(3);
  });

  it("move_page, promote_to_hub, create_page dalle keyword di B e l'unione di un hub con uno spoke iniziato sono bloccati", async () => {
    const root = await rootAdminWithKey("t7502-others");
    const plan = await lockedPlan(root, "PUBLISHED");
    const before = await saved(plan);

    const replies = [
      await editPlan(root, plan, 3, { type: "move_page", pageId: plan.pageIds.b, targetHubId: plan.pageIds.hub2 }),
      await editPlan(root, plan, 3, { type: "promote_to_hub", pageId: plan.pageIds.b }),
      await editPlan(root, plan, 3, { type: "create_page", keywordIds: [plan.keywordIds[B_SECOND]], hubPageId: plan.pageIds.hub }),
      await editPlan(root, plan, 3, { type: "merge_pages", sourcePageId: plan.pageIds.hub, targetPageId: plan.pageIds.hub2 }),
    ];

    for (const reply of replies) expect(reply.data).toMatchObject({ code: "AGENT_PAGE_LOCKED", pageId: plan.pageIds.b });
    expect(await saved(plan)).toEqual(before);
  });

  it("sulle pagine da scrivere le operazioni passano: create_page risponde con il pageId, move_page e merge_pages cambiano il piano", async () => {
    const root = await rootAdminWithKey("t7502-allowed");
    const plan = await lockedPlan(root, "WRITING");

    const created = await editPlan(root, plan, 3, { type: "create_page", keywordIds: [plan.keywordIds[A_SECOND]], hubPageId: plan.pageIds.hub, h1: "Prezzi" });
    const pageId = String(created.data?.pageId);
    const movedPage = await editPlan(root, plan, 4, { type: "move_page", pageId: plan.pageIds.c, targetHubId: plan.pageIds.hub });
    const merged = await editPlan(root, plan, 5, { type: "merge_pages", sourcePageId: pageId, targetPageId: plan.pageIds.a });

    expect(created.data).toMatchObject({ strategyId: plan.strategyId, version: 4 });
    expect(movedPage.data).toMatchObject({ version: 5 });
    expect(merged.data).toMatchObject({ version: 6 });
    const after = await saved(plan);
    expect(after.pageOf[A_SECOND]).toBe(plan.pageIds.a);
    expect(after.pages.find((page) => page.id === plan.pageIds.c)).toMatchObject({ hub_page_id: plan.pageIds.hub });
    expect(after.pages.some((page) => page.id === pageId)).toBe(false);
  });
});

describe("update_page con le pagine iniziate protette", () => {
  // covers: AC-7502-3
  it("su B pubblicata un H1 nuovo è AGENT_PAGE_LOCKED e l'H1 resta; l'indirizzo pubblicato si salva", async () => {
    const root = await rootAdminWithKey("t7502-page");
    const plan = await lockedPlan(root, "PUBLISHED");

    const retitled = await callTool(root.key, "update_page", { projectId: plan.projectId, version: 3, pageId: plan.pageIds.b, h1: "H1 nuovo" });
    const published = await callTool(root.key, "update_page", {
      projectId: plan.projectId,
      version: 3,
      pageId: plan.pageIds.b,
      publishedUrl: "https://esempio.it/b",
    });

    expect(retitled.result?.isError).toBe(true);
    expect(retitled.data).toMatchObject({ code: "AGENT_PAGE_LOCKED", pageId: plan.pageIds.b });
    expect(published.result?.isError).not.toBe(true);
    expect(published.data).toEqual({ strategyId: plan.strategyId, pageId: plan.pageIds.b, version: 4 });
    const page = await prisma.strategyPage.findUniqueOrThrow({ where: { id: plan.pageIds.b } });
    expect(page).toMatchObject({ h1: "H1 di B", h1_edited: false, published_url: "https://esempio.it/b", status: "PUBLISHED" });
  });

  it("su una pagina da scrivere cambiano H1, H2 e tipo; su B pubblicata lo stato; una version vecchia è STRATEGY_CONFLICT", async () => {
    const root = await rootAdminWithKey("t7502-page-allowed");
    const plan = await lockedPlan(root, "PUBLISHED");

    const titled = await callTool(root.key, "update_page", {
      projectId: plan.projectId,
      version: 3,
      pageId: plan.pageIds.a,
      h1: "Quanto costa la magnetoterapia a noleggio",
      h2: ["Prezzi al giorno", "Prezzi al mese"],
      contentType: "comparison",
    });
    const reopened = await callTool(root.key, "update_page", { projectId: plan.projectId, version: 4, pageId: plan.pageIds.b, status: "WRITING" });
    const stale = await callTool(root.key, "update_page", { projectId: plan.projectId, version: 4, pageId: plan.pageIds.a, h1: "Altro" });

    expect(titled.data).toMatchObject({ version: 4 });
    expect(reopened.data).toMatchObject({ version: 5 });
    expect(stale.data).toMatchObject({ code: "STRATEGY_CONFLICT", currentVersion: 5 });
    const pages = await prisma.strategyPage.findMany({ where: { id: { in: [plan.pageIds.a, plan.pageIds.b] } }, orderBy: { position: "asc" } });
    expect(pages.map(({ h1, h2, content_type, status }) => ({ h1, h2, content_type, status }))).toEqual([
      { h1: "Quanto costa la magnetoterapia a noleggio", h2: ["Prezzi al giorno", "Prezzi al mese"], content_type: "comparison", status: "TODO" },
      { h1: "H1 di B", h2: ["H2 b"], content_type: "guide", status: "WRITING" },
    ]);
  });
});
