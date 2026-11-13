import { NextResponse } from "next/server";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { readActivePlanRunFor } from "@/lib/modules/plan-runs/service";

export const runtime = "nodejs";

/** Lavoro di piano attivo del progetto (T-6202), con project.read: il suo stato, o data null se non ce n'è. */
export const GET = withUserRoute(async (_request: Request, user, { id }: ProjectParams) => {
  const data = await readActivePlanRunFor(user, id);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
});
