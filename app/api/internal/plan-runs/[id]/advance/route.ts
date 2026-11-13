import { NextResponse } from "next/server";
import { withApiErrors } from "@/lib/http/errors";
import { acceptPlanRunStep } from "@/lib/modules/plan-runs/run";

export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Passo di un lavoro di piano (T-6201): fuori dal controllo di sessione del proxy, protetta dalla firma HMAC di
 * «plan-run:» più l'id e della scadenza; 401 con una firma non valida, anche quella di un job delle ricerche o di un
 * lavoro di articolo con lo stesso id. Altrimenti 202 subito e il passo in after(), entro la maxDuration della rotta.
 */
async function advancePlanRunRoute(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: runId } = await context.params;
  acceptPlanRunStep(runId, request.headers);
  return NextResponse.json({ data: { runId } }, { status: 202 });
}

export const POST = withApiErrors(advancePlanRunRoute);
