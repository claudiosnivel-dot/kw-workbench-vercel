// Gate di T-1904 (AC-1904-1…5): spostamenti, eliminazioni e unioni mantengono le regole del piano, la version
// respinge le modifiche concorrenti e la PATCH di una pagina valida H1 e H2.
import { randomUUID } from "node:crypto";
import { createTranslator } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchPage } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/route";
import { POST as operate } from "@/app/api/projects/[id]/strategies/[strategyId]/operations/route";
import { buildPageTitles } from "@/lib/modules/strategy/titles";
import { prisma } from "@/lib/prisma";
import it_ from "@/messages/it.json";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { insertStrategy, type PlanKeywordSpec, type PlanPageSpec } from "../helpers/strategy";

type Session = Awaited<ReturnType<typeof createUserWithSession>>;

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

let session: Session;
let projectId: string;

/** Utente e progetto nuovi con la strategia scritta a mano (la prima keyword di ogni pagina è la principale). */
async function createPlan(pages: PlanPageSpec[], version = 0) {
  session = await createUserWithSession({ displayName: `t1904-${randomUUID().slice(0, 8)}` });
  projectId = (await prisma.project.create({ data: { name: "P", workspace_id: session.workspaceId, language_code: "it" } })).id;
  return insertStrategy({ projectId, pages, version });
}

function runOperation(strategyId: string, version: number, operation: Record<string, unknown>) {
  return callRoute(operate, {
    method: "POST",
    url: `/api/projects/${projectId}/strategies/${strategyId}/operations`,
    cookie: session.cookie,
    params: { id: projectId, strategyId },
    body: { version, operation },
  });
}

function sendPagePatch(strategyId: string, pageId: string, body: unknown) {
  return callRoute(patchPage, {
    method: "PATCH",
    url: `/api/projects/${projectId}/strategies/${strategyId}/pages/${pageId}`,
    cookie: session.cookie,
    params: { id: projectId, strategyId, pageId },
    body,
  });
}

async function pageKeywords(pageId: string) {
  return prisma.strategyKeyword.findMany({
    where: { page_id: pageId },
    orderBy: [{ role: "asc" }, { volume: "desc" }],
    select: { canonical_keyword: true, role: true },
  });
}

const kw = (text: string, volume: number): PlanKeywordSpec => ({ text, volume });

describe("modifiche al piano", () => {
  // covers: AC-1904-1
  it("spostando la principale di uno spoke diventa principale la secondaria più cercata", async () => {
    const { strategyId, pageIds, keywordIds } = await createPlan([
      { key: "H", kind: "HUB", keywords: [kw("scarpe running", 5000)] },
      { key: "A", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running donna", 900), kw("scarpe running da donna", 500), kw("scarpe donna running", 300)] },
      { key: "B", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running uomo", 700)] },
    ]);
    const before = await prisma.strategyKeyword.count({ where: { strategy_id: strategyId } });

    const response = await runOperation(strategyId, 0, {
      type: "move_keywords",
      keywordIds: [keywordIds["scarpe running donna"]],
      targetPageId: pageIds.B,
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { version: number } }).data.version).toBe(1);
    expect(await pageKeywords(pageIds.A)).toEqual([
      { canonical_keyword: "scarpe running da donna", role: "MAIN" },
      { canonical_keyword: "scarpe donna running", role: "SECONDARY" },
    ]);
    expect(await pageKeywords(pageIds.B)).toEqual([
      { canonical_keyword: "scarpe running uomo", role: "MAIN" },
      { canonical_keyword: "scarpe running donna", role: "SECONDARY" },
    ]);
    expect(await prisma.strategyKeyword.count({ where: { strategy_id: strategyId } })).toBe(before);
  });

  // covers: AC-1904-2
  it("uno spoke svuotato sparisce e l'hub eliminato rende hub i suoi spoke", async () => {
    const { strategyId, pageIds, keywordIds } = await createPlan([
      { key: "G", kind: "HUB", keywords: [kw("calzini running", 800)] },
      { key: "X", kind: "SPOKE", hub: "G", keywords: [kw("calzini running lunghi", 120)] },
      { key: "H", kind: "HUB", keywords: [kw("scarpe running", 5000), kw("scarpa running", 900)] },
      { key: "S1", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running donna", 900)] },
      { key: "S2", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running uomo", 700)] },
    ]);

    const moved = await runOperation(strategyId, 0, { type: "move_keywords", keywordIds: [keywordIds["calzini running lunghi"]], targetPageId: null });
    const deleted = await runOperation(strategyId, 1, { type: "delete_page", pageId: pageIds.H });

    expect([moved.status, deleted.status]).toEqual([200, 200]);
    expect(await prisma.strategyPage.count({ where: { id: { in: [pageIds.X, pageIds.H] } } })).toBe(0);
    const spokes = await prisma.strategyPage.findMany({ where: { id: { in: [pageIds.S1, pageIds.S2] } }, select: { kind: true, hub_page_id: true } });
    expect(spokes).toEqual([
      { kind: "HUB", hub_page_id: null },
      { kind: "HUB", hub_page_id: null },
    ]);
    const formerHub = await prisma.strategyKeyword.findMany({
      where: { id: { in: [keywordIds["scarpe running"], keywordIds["scarpa running"]] } },
      select: { page_id: true, role: true },
    });
    expect(formerHub).toEqual([
      { page_id: null, role: "SECONDARY" },
      { page_id: null, role: "SECONDARY" },
    ]);
    const strategy = await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId } });
    expect([strategy.assigned_count, strategy.unassigned_count, strategy.version]).toEqual([3, 3, 2]);
  });

  // covers: AC-1904-3
  it("unendo due pagine gli H2 si ricalcolano solo se non modificati dall'utente", async () => {
    const { strategyId, pageIds } = await createPlan([
      { key: "H", kind: "HUB", keywords: [kw("scarpe running", 5000)] },
      { key: "A", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running asics", 400), kw("scarpe running asics gel", 90)] },
      { key: "B", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running nike", 600)] },
      { key: "C", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running trail", 300)] },
      { key: "D", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running montagna", 350)], h2Edited: true, h2: ["Il mio H2"] },
    ]);

    const first = await runOperation(strategyId, 0, { type: "merge_pages", sourcePageId: pageIds.A, targetPageId: pageIds.B });
    const second = await runOperation(strategyId, 1, { type: "merge_pages", sourcePageId: pageIds.C, targetPageId: pageIds.D });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect((await pageKeywords(pageIds.B)).map((row) => row.canonical_keyword)).toEqual([
      "scarpe running nike",
      "scarpe running asics",
      "scarpe running asics gel",
    ]);
    const t = createTranslator({ locale: "it", messages: it_, namespace: "strategy" });
    const keyword = (text: string) => ({ keyword: text, canonical: text, isQuestion: false });
    const expected = buildPageTitles(
      {
        kind: "SPOKE",
        contentType: "guide",
        main: keyword("scarpe running nike"),
        secondary: [keyword("scarpe running asics"), keyword("scarpe running asics gel")],
      },
      { language: "it", year: new Date().getUTCFullYear(), translate: (key, values) => t(key as never, values as never) }
    );
    const pageB = await prisma.strategyPage.findUniqueOrThrow({ where: { id: pageIds.B } });
    expect(pageB.h2).toEqual(expected.h2);
    expect(pageB.h2).toEqual(["Scarpe running asics", "Scarpe running asics gel"]);

    expect((await pageKeywords(pageIds.D)).map((row) => row.canonical_keyword)).toEqual([
      "scarpe running montagna",
      "scarpe running trail",
    ]);
    expect((await prisma.strategyPage.findUniqueOrThrow({ where: { id: pageIds.D } })).h2).toEqual(["Il mio H2"]);
    expect(await prisma.strategyPage.count({ where: { id: { in: [pageIds.A, pageIds.C] } } })).toBe(0);
  });

  // covers: AC-1904-4
  it("due operazioni con la stessa version: una passa e porta la version a 4, l'altra riceve 409 senza effetti", async () => {
    const { strategyId, pageIds, keywordIds } = await createPlan(
      [
        { key: "H", kind: "HUB", keywords: [kw("scarpe running", 5000), kw("scarpa running", 900), kw("running scarpe", 90)] },
        { key: "B", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running donna", 900)] },
        { key: "C", kind: "SPOKE", hub: "H", keywords: [kw("scarpe running uomo", 700)] },
      ],
      3
    );

    const responses = await Promise.all([
      runOperation(strategyId, 3, { type: "move_keywords", keywordIds: [keywordIds["scarpa running"]], targetPageId: pageIds.B }),
      runOperation(strategyId, 3, { type: "move_keywords", keywordIds: [keywordIds["running scarpe"]], targetPageId: pageIds.C }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const loser = responses.find((response) => response.status === 409)!;
    expect(((await loser.json()) as { code: string }).code).toBe("STRATEGY_CONFLICT");
    expect((await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId } })).version).toBe(4);

    const firstWon = responses[0].status === 200;
    const placed = await prisma.strategyKeyword.findMany({
      where: { id: { in: [keywordIds["scarpa running"], keywordIds["running scarpe"]] } },
      select: { canonical_keyword: true, page_id: true },
      orderBy: { canonical_keyword: "asc" },
    });
    expect(placed).toEqual([
      { canonical_keyword: "running scarpe", page_id: firstWon ? pageIds.H : pageIds.C },
      { canonical_keyword: "scarpa running", page_id: firstWon ? pageIds.B : pageIds.H },
    ]);
  });

  // covers: AC-1904-5
  it("la PATCH di una pagina rifiuta un H1 di 201 caratteri e 31 H2, poi salva un H1 valido come modificato", async () => {
    const { strategyId, pageIds } = await createPlan([{ key: "H", kind: "HUB", keywords: [kw("scarpe running", 5000)] }]);

    const tooLong = await sendPagePatch(strategyId, pageIds.H, { version: 0, h1: "x".repeat(201) });
    const tooMany = await sendPagePatch(strategyId, pageIds.H, { version: 0, h2: Array.from({ length: 31 }, (_, i) => `H2 ${i}`) });
    const before = await prisma.strategyPage.findUniqueOrThrow({ where: { id: pageIds.H } });
    const valid = await sendPagePatch(strategyId, pageIds.H, { version: 0, h1: "Scarpe running: la nostra guida" });

    expect([tooLong.status, tooMany.status]).toEqual([400, 400]);
    expect(((await tooLong.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect(((await tooMany.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
    expect([before.h1, before.h1_edited, before.h2]).toEqual(["H1 H", false, ["H2 H"]]);
    expect(valid.status).toBe(200);
    const after = await prisma.strategyPage.findUniqueOrThrow({ where: { id: pageIds.H } });
    expect([after.h1, after.h1_edited]).toEqual(["Scarpe running: la nostra guida", true]);
    expect((await prisma.strategy.findUniqueOrThrow({ where: { id: strategyId } })).version).toBe(1);
  });

  it("una pagina di un'altra strategia nell'operazione è STRATEGY_NOT_FOUND e non cambia nulla", async () => {
    const first = await createPlan([{ key: "H", kind: "HUB", keywords: [kw("scarpe running", 5000)] }]);
    const otherStrategy = await prisma.strategy.create({
      data: { project_id: projectId, name: "Altra", mode: "AUTO", settings: {}, language: "it", considered_count: 0, assigned_count: 0, unassigned_count: 0 },
    });

    const response = await runOperation(otherStrategy.id, 0, { type: "delete_page", pageId: first.pageIds.H });

    expect(response.status).toBe(404);
    expect(((await response.json()) as { code: string }).code).toBe("STRATEGY_NOT_FOUND");
    expect(await prisma.strategyPage.count({ where: { id: first.pageIds.H } })).toBe(1);
    expect((await prisma.strategy.findUniqueOrThrow({ where: { id: otherStrategy.id } })).version).toBe(0);
  });
});
