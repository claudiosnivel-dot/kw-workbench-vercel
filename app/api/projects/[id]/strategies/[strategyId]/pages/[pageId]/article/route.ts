import { NextResponse } from "next/server";
import { updateArticle } from "@/lib/articles/edit";
import { readArticle, startArticle } from "@/lib/articles/service";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";

/**
 * Avvio della generazione dell'articolo di una pagina del piano (T-4002) con { length, notes? }: 202 { data: { articleId,
 * runId } }; 503 AI_NOT_CONFIGURED, 409 JOB_ALREADY_ACTIVE o STRATEGY_READ_ONLY, 429 RATE_LIMITED con Retry-After.
 */
export const POST = withUserRoute(async (request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const data = await startArticle(user, id, strategyId, pageId, await request.json());
  return NextResponse.json({ data }, { status: 202, headers: { "Cache-Control": "no-store" } });
});

/**
 * Modifica dall'editor (T-4402) con { version, sections?, meta_title?, meta_description?, slug? }: 200 { data } con
 * l'articolo aggiornato; 400 VALIDATION_ERROR, 404 ARTICLE_NOT_FOUND, 409 ARTICLE_VERSION_CONFLICT o JOB_ALREADY_ACTIVE.
 */
export const PATCH = withUserRoute(async (request: Request, user, params: StrategyPageParams) => {
  const article = await updateArticle(user, params.id, params.strategyId, params.pageId, await request.json());
  return NextResponse.json({ data: article }, { headers: { "Cache-Control": "no-store" } });
});

/** Articolo della pagina con i blocchi in ordine e il lavoro attivo (T-4002), oppure 404 ARTICLE_NOT_FOUND. */
export const GET = withUserRoute(async (_request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const data = await readArticle(user, id, strategyId, pageId);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
