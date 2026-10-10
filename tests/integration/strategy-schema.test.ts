// Gate di T-1901 (AC-1901-5): migrazione 0039, una keyword al massimo una volta per strategia, una sola keyword
// principale per pagina (indice unico parziale) e RLS abilitata sulle tre tabelle delle strategie.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

beforeEach(async () => {
  await resetDatabase();
});

async function createStrategyWithPage() {
  const { workspaceId } = await createUserWithSession();
  const project = await prisma.project.create({ data: { name: "Schema", workspace_id: workspaceId } });
  const strategy = await prisma.strategy.create({
    data: {
      project_id: project.id,
      name: "Strategia",
      mode: "AUTO",
      settings: {},
      language: "it",
      considered_count: 0,
      assigned_count: 0,
      unassigned_count: 0,
    },
  });
  const page = await prisma.strategyPage.create({
    data: {
      strategy_id: strategy.id,
      kind: "HUB",
      h1: "Scarpe running",
      h2: [],
      content_type: "guide",
      priority: 0,
      position: 0,
      reason_code: "HUB_SEED",
      reason_params: {},
    },
  });
  return { strategyId: strategy.id, pageId: page.id };
}

function keywordRow(strategyId: string, pageId: string | null, canonical: string, role: "MAIN" | "SECONDARY") {
  return {
    id: randomUUID(),
    strategy_id: strategyId,
    page_id: pageId,
    role,
    keyword: canonical,
    canonical_keyword: canonical,
    score_source: "heuristic" as const,
    search_intent: "mixed" as const,
    keyword_type: "generic" as const,
    is_question: false,
    is_local: false,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

describe("schema delle strategie", () => {
  // covers: AC-1901-5
  it("rifiuta la stessa forma canonica due volte e due principali nella stessa pagina; RLS sulle tre tabelle", async () => {
    const { strategyId, pageId } = await createStrategyWithPage();

    await prisma.strategyKeyword.create({ data: keywordRow(strategyId, pageId, "scarpe running", "MAIN") });
    const duplicate = await prisma.strategyKeyword
      .create({ data: keywordRow(strategyId, null, "scarpe running", "SECONDARY") })
      .then(() => null, (error: unknown) => error);
    expect(isUniqueViolation(duplicate)).toBe(true);

    const secondMain = await prisma.strategyKeyword
      .create({ data: keywordRow(strategyId, pageId, "scarpe da running", "MAIN") })
      .then(() => null, (error: unknown) => error);
    expect(isUniqueViolation(secondMain)).toBe(true);
    expect(await prisma.strategyKeyword.count({ where: { strategy_id: strategyId } })).toBe(1);

    const tables = await prisma.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('strategies', 'strategy_pages', 'strategy_keywords')
      ORDER BY c.relname
    `;
    expect(tables).toEqual([
      { relname: "strategies", relrowsecurity: true },
      { relname: "strategy_keywords", relrowsecurity: true },
      { relname: "strategy_pages", relrowsecurity: true },
    ]);
  });
});
