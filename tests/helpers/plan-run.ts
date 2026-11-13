import { POST as createStrategy } from "@/app/api/projects/[id]/strategies/route";
import { advancePlanRun } from "@/lib/modules/plan-runs/run";
import { prisma } from "@/lib/prisma";
import { callRoute } from "./http";

/*
 * Supporto dei test del piano dopo T-6201: la POST /strategies avvia un lavoro di piano (202 con runId) e la strategia
 * nasce quando il lavoro arriva in fondo. I test portano il lavoro in fondo con i passi del motore, senza la
 * continuazione HTTP.
 */

const STEP_MS = 270_000;

/** Esegue i passi del lavoro finché non è più attivo (al massimo 10) e restituisce la riga del lavoro. */
export async function finishPlanRun(runId: string) {
  for (let step = 0; step < 10; step += 1) {
    const result = await advancePlanRun(runId, Date.now() + STEP_MS);
    if (!result.more) break;
  }
  return prisma.planRun.findUniqueOrThrow({ where: { id: runId } });
}

/**
 * POST /api/projects/{id}/strategies e, con la risposta 202, il lavoro di piano portato in fondo: la risposta della POST
 * (il corpo resta da leggere per gli errori), la riga del lavoro e l'id della strategia salvata (null se il lavoro non è
 * partito o non è riuscito).
 */
export async function generatePlan(cookie: string, projectId: string, body: unknown) {
  const response = await callRoute(createStrategy, {
    method: "POST",
    url: `/api/projects/${projectId}/strategies`,
    cookie,
    params: { id: projectId },
    body,
  });
  if (response.status !== 202) {
    return { response, run: null, strategyId: null };
  }
  const { data } = (await response.clone().json()) as { data: { runId: string } };
  const run = await finishPlanRun(data.runId);
  return { response, run, strategyId: run.strategy_id };
}
