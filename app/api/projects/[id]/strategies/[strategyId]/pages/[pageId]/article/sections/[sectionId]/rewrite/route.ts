import { NextResponse } from "next/server";
import { startSectionRewrite } from "@/lib/articles/edit";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";

type SectionRewriteParams = StrategyPageParams & { sectionId: string };

/**
 * «Riscrivi questo blocco» (T-4402) con { instruction? }: 202 { data: { runId } } con il lavoro di scope SECTION; 503
 * AI_NOT_CONFIGURED, 404 ARTICLE_NOT_FOUND, 409 JOB_ALREADY_ACTIVE o STRATEGY_READ_ONLY, 429 RATE_LIMITED con Retry-After.
 */
export const POST = withUserRoute(async (request: Request, user, { id, strategyId, pageId, sectionId }: SectionRewriteParams) => {
  const data = await startSectionRewrite(user, id, strategyId, pageId, sectionId, await request.json());
  return NextResponse.json({ data }, { status: 202, headers: { "Cache-Control": "no-store" } });
});
