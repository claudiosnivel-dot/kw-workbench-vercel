import { NextResponse } from "next/server";
import { sendArticleToWordPress } from "@/lib/articles/wordpress";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";

export const runtime = "nodejs";

/**
 * Invio dell'articolo a WordPress come bozza (T-4602) con strategy.write: 200 { data: { postId, postUrl } }; 409
 * WP_NOT_CONFIGURED, STRATEGY_READ_ONLY o JOB_ALREADY_ACTIVE, 502 WP_AUTH_FAILED, WP_UNREACHABLE o WP_REJECTED.
 */
export const POST = withUserRoute(async (_request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const data = await sendArticleToWordPress(user, id, strategyId, pageId);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
