import { NextResponse } from "next/server";
import { type PlanRunParams, withUserRoute } from "@/lib/http/user-route";
import { readPlanRunStatus } from "@/lib/modules/plan-runs/service";

export const runtime = "nodejs";

/**
 * Stato di un lavoro di piano del progetto (T-6202), con project.read: stato, fase, avanzamento, strategia salvata e
 * codice d'errore; 404 PLAN_RUN_NOT_FOUND per il lavoro di un altro progetto. La lettura riprende un lavoro fermo.
 */
export const GET = withUserRoute(async (_request: Request, user, { id, runId }: PlanRunParams) => {
  const data = await readPlanRunStatus(user, id, runId);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
