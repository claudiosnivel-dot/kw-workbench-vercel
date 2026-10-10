import { randomUUID } from "node:crypto";
import type { KeywordType, SearchIntent } from "@/lib/generated/prisma/enums";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import type { PlanReason, StrategyContentType, StrategyKeywordInput, StrategyPageKind, StrategyPlan } from "@/lib/modules/strategy/types";
import { prisma } from "@/lib/prisma";
import english from "../fixtures/strategy/en-running-gear.json";
import italian from "../fixtures/strategy/it-scarpe-running.json";

/** Keyword di una fixture di tests/fixtures/strategy (T-1901). */
export type FixtureKeyword = {
  keyword: string;
  volume: number | null;
  score: number | null;
  searchIntent: string;
  keywordType: string;
  isQuestion?: boolean;
};

/** Pagina attesa: la pagina e il suo hub sono indicati dalla keyword principale. */
export type ExpectedPage = {
  kind: StrategyPageKind;
  hub: string | null;
  main: string;
  secondary: string[];
  contentType: StrategyContentType;
  priority: number;
  reason: PlanReason;
};

export type StrategyFixture = {
  language: string;
  seeds: string[];
  keywords: FixtureKeyword[];
  expected: { pages: ExpectedPage[]; unassigned: string[] };
};

export const ITALIAN_FIXTURE = italian as unknown as StrategyFixture;
export const ENGLISH_FIXTURE = english as unknown as StrategyFixture;

/** Keyword della fixture come ingresso del motore: forma canonica di T-702, punteggio da metriche se c'è il volume. */
export function fixtureInputs(fixture: Pick<StrategyFixture, "keywords" | "language">): StrategyKeywordInput[] {
  return fixture.keywords.map((item, index) => ({
    sourceId: `k${index}`,
    keyword: item.keyword,
    canonical: canonicalizeKeyword(item.keyword, fixture.language),
    volume: item.volume,
    score: item.score,
    scoreSource: item.volume === null ? "heuristic" : "metrics",
    searchIntent: item.searchIntent as SearchIntent,
    keywordType: item.keywordType as KeywordType,
    isQuestion: item.isQuestion ?? false,
    isLocal: item.keywordType === "local",
  }));
}

/** Piano nella forma della fixture: pagine nell'ordine di lavoro con l'hub indicato dalla sua keyword principale. */
export function describePlan(plan: StrategyPlan): StrategyFixture["expected"] {
  const mainOf = new Map(plan.pages.map((page) => [page.ref, page.main]));
  return {
    pages: plan.pages.map((page) => ({
      kind: page.kind,
      hub: page.hubRef ? mainOf.get(page.hubRef)! : null,
      main: page.main,
      secondary: page.secondary,
      contentType: page.contentType,
      priority: page.priority,
      reason: page.reason,
    })),
    unassigned: plan.unassigned,
  };
}

export type PlanKeywordSpec = { text: string; volume: number | null };

/** Pagina scritta a mano: la prima keyword è la principale; hub è la key della pagina pilastro dello spoke. */
export type PlanPageSpec = {
  key: string;
  kind: StrategyPageKind;
  hub?: string;
  keywords: PlanKeywordSpec[];
  h1?: string;
  h2?: string[];
  h2Edited?: boolean;
};

/**
 * Strategia salvata direttamente nel DB di test (T-1904…T-1907), senza il motore: pagine nell'ordine di position,
 * keyword con la principale per prima, non assegnate facoltative.
 */
export async function insertStrategy(params: {
  projectId: string;
  pages: PlanPageSpec[];
  unassigned?: PlanKeywordSpec[];
  version?: number;
  name?: string;
}) {
  const unassigned = params.unassigned ?? [];
  const assigned = params.pages.reduce((sum, page) => sum + page.keywords.length, 0);
  const strategy = await prisma.strategy.create({
    data: {
      project_id: params.projectId,
      name: params.name ?? "Piano",
      mode: "AUTO",
      settings: {},
      language: "it",
      considered_count: assigned + unassigned.length,
      assigned_count: assigned,
      unassigned_count: unassigned.length,
      version: params.version ?? 0,
    },
  });
  const pageIds: Record<string, string> = Object.fromEntries(params.pages.map((page) => [page.key, randomUUID()]));
  const keywordIds: Record<string, string> = {};
  const keywordRow = (keyword: PlanKeywordSpec, pageId: string | null, role: "MAIN" | "SECONDARY") => {
    keywordIds[keyword.text] = randomUUID();
    return {
      id: keywordIds[keyword.text],
      strategy_id: strategy.id,
      page_id: pageId,
      role,
      keyword: keyword.text,
      canonical_keyword: keyword.text,
      volume: keyword.volume,
      score: 50,
      score_source: "metrics" as const,
      search_intent: "mixed" as const,
      keyword_type: "generic" as const,
      is_question: false,
      is_local: false,
    };
  };
  for (const kind of ["HUB", "SPOKE"] as const) {
    const pages = params.pages.map((page, position) => ({ page, position })).filter(({ page }) => page.kind === kind);
    await prisma.strategyPage.createMany({
      data: pages.map(({ page, position }) => ({
        id: pageIds[page.key],
        strategy_id: strategy.id,
        kind: page.kind,
        hub_page_id: page.hub ? pageIds[page.hub] : null,
        h1: page.h1 ?? `H1 ${page.key}`,
        h2: page.h2 ?? [`H2 ${page.key}`],
        h2_edited: page.h2Edited ?? false,
        content_type: "guide" as const,
        priority: page.keywords.reduce((sum, keyword) => sum + (keyword.volume ?? 0), 0),
        position,
        reason_code: page.kind === "HUB" ? "HUB_SEED" : "SPOKE_WORD",
        reason_params: page.kind === "HUB" ? { seed: page.keywords[0].text, merged: 0, faq: 0 } : { word: page.key, faq: 0 },
      })),
    });
  }
  await prisma.strategyKeyword.createMany({
    data: [
      ...params.pages.flatMap((page) =>
        page.keywords.map((keyword, index) => keywordRow(keyword, pageIds[page.key], index === 0 ? "MAIN" : "SECONDARY"))
      ),
      ...unassigned.map((keyword) => keywordRow(keyword, null, "SECONDARY")),
    ],
  });
  return { strategyId: strategy.id, pageIds, keywordIds };
}
