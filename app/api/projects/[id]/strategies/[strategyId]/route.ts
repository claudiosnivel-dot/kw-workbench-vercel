import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type StrategyParams, withUserRoute } from "@/lib/http/user-route";
import { deleteStrategy, readStrategy, renameStrategy } from "@/lib/modules/strategy/service";

/** Piano completo: hub, spoke, H1, H2, keyword, motivi e non assegnate (T-1903). */
export const GET = withUserRoute(async (_request: Request, user, { id, strategyId }: StrategyParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.json({ data: await readStrategy(project.id, strategyId) });
});

/** Rinomina con { name, version }: 409 STRATEGY_CONFLICT se la strategia è cambiata nel frattempo. */
export const PATCH = withUserRoute(async (request: Request, user, { id, strategyId }: StrategyParams) => {
  const version = await renameStrategy(user, id, strategyId, await request.json());
  return NextResponse.json({ data: { version } });
});

export const DELETE = withUserRoute(async (_request: Request, user, { id, strategyId }: StrategyParams) => {
  await deleteStrategy(user, id, strategyId);
  return NextResponse.json({ success: true });
});
