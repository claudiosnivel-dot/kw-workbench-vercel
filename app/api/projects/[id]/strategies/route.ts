import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { startPlanRun } from "@/lib/modules/plan-runs/service";
import { listStrategies, parseGenerateRequest } from "@/lib/modules/strategy/service";

export const runtime = "nodejs";

/** Strategie hub and spoke del progetto, dalla più recente (T-1903). */
export const GET = withUserRoute(async (_request: Request, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.json({ data: await listStrategies(project.id) });
});

/**
 * Avvia il lavoro di piano in modalità automatica o esperta (T-1903 emendato da T-6201): stessi permessi, parse e limiti
 * della generazione, poi 202 con il runId; il lavoro chiede volumi e risultati di Google e salva la strategia. Con un
 * lavoro attivo nel progetto 409 JOB_ALREADY_ACTIVE con il suo runId.
 */
export const POST = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const parsed = parseGenerateRequest(await request.json());
  const t = await getTranslations("strategy.ui");
  const runId = await startPlanRun(user, id, parsed, t("defaultName", { mode: parsed.mode, date: new Date() }));
  return NextResponse.json({ data: { runId } }, { status: 202 });
});
