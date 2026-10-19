import { NextResponse } from "next/server";
import { cancelArticleRun } from "@/lib/articles/service";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";

/**
 * Annulla il lavoro attivo dell'articolo della pagina (T-4002): 200 { data: { runId, status: "canceled" } }; 404
 * ARTICLE_NOT_FOUND senza articolo, 409 JOB_NOT_CANCELABLE senza lavoro attivo.
 */
export const DELETE = withUserRoute(async (_request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const { runId } = await cancelArticleRun(user, id, strategyId, pageId);
  return NextResponse.json({ data: { runId, status: "canceled" } });
});
