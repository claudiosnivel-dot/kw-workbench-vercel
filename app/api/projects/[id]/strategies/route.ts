import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { type ProjectParams, withUserRoute } from "@/lib/http/user-route";
import { generateStrategy, listStrategies, parseGenerateRequest } from "@/lib/modules/strategy/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Strategie hub and spoke del progetto, dalla più recente (T-1903). */
export const GET = withUserRoute(async (_request: Request, user, { id }: ProjectParams) => {
  const project = await requireProjectAccess(user, id, "project.read", {});
  return NextResponse.json({ data: await listStrategies(project.id) });
});

/** Genera una strategia in modalità automatica o esperta e la salva (T-1903): 201 con l'id. */
export const POST = withUserRoute(async (request: Request, user, { id }: ProjectParams) => {
  const parsed = parseGenerateRequest(await request.json());
  const t = await getTranslations("strategy.ui");
  const strategyId = await generateStrategy(user, id, parsed, t("defaultName", { mode: parsed.mode, date: new Date() }));
  return NextResponse.json({ data: { id: strategyId } }, { status: 201 });
});
