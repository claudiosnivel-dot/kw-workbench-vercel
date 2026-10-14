import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type StrategyParams, withUserRoute } from "@/lib/http/user-route";
import { planHref, planVersionHref } from "@/lib/modules/next-step";
import { findPlanId } from "@/lib/modules/strategy/service";

/**
 * Vecchio indirizzo di una strategia (T-2502): 308 verso il piano se è la strategia più recente, altrimenti verso la sua
 * versione in sola lettura, che risponde 404 se non è del progetto. Progetto fuori dal workspace: 404.
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id, strategyId }: StrategyParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  const target = (await findPlanId(project.id)) === strategyId ? planHref(project.id) : planVersionHref(project.id, strategyId);
  return NextResponse.redirect(new URL(target, request.nextUrl.origin), 308);
});
