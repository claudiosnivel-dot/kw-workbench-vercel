import { NextResponse } from "next/server";
import { type StrategyParams, withUserRoute } from "@/lib/http/user-route";
import { operateOnStrategy } from "@/lib/modules/strategy/service";

/**
 * Operazione sulla struttura del piano (T-1904): move_keywords, promote_to_hub, merge_pages o delete_page, con la
 * version letta dal client; risponde con la nuova version o 409 STRATEGY_CONFLICT senza modifiche.
 */
export const POST = withUserRoute(async (request: Request, user, { id, strategyId }: StrategyParams) => {
  const version = await operateOnStrategy(user, id, strategyId, await request.json());
  return NextResponse.json({ data: { version } });
});
