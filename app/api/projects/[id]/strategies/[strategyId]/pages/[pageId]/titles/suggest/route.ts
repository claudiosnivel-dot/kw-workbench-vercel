import { NextResponse } from "next/server";
import { discardPageProposal, suggestPageTitles } from "@/lib/ai/suggest";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";

// Timeout della chiamata al modello 20 s (T-3601), più i controlli e il salvataggio.
export const maxDuration = 30;

/**
 * Proposta dei titoli con l'AI per una pagina del piano (T-3601): 200 { data: { h1, h2, model, createdAt } } no-store,
 * salvata nella pagina al posto della precedente; 503 AI_NOT_CONFIGURED, 429 RATE_LIMITED, 504 AI_TIMEOUT, 502
 * AI_UNAVAILABLE e AI_INVALID_RESPONSE lasciano titoli e proposta salvata com'erano.
 */
export const POST = withUserRoute(async (_request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const data = await suggestPageTitles(user, id, strategyId, pageId);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});

/** Scarta la proposta salvata nella pagina (T-3602): 204 anche senza proposta. */
export const DELETE = withUserRoute(async (_request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  await discardPageProposal(user, id, strategyId, pageId);
  return new NextResponse(null, { status: 204 });
});
