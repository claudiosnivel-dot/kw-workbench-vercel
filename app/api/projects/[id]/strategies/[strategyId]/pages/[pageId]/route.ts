import { NextResponse } from "next/server";
import { type StrategyPageParams, withUserRoute } from "@/lib/http/user-route";
import { patchStrategyPage } from "@/lib/modules/strategy/service";

/** H1, H2 e tipo di contenuto di una pagina del piano (T-1904), con la version letta dal client. */
export const PATCH = withUserRoute(async (request: Request, user, { id, strategyId, pageId }: StrategyPageParams) => {
  const version = await patchStrategyPage(user, id, strategyId, pageId, await request.json());
  return NextResponse.json({ data: { version } });
});
