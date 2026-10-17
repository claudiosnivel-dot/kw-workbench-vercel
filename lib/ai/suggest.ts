import { AiTitlesError } from "@/lib/ai/errors";
import { requestCompletion } from "@/lib/ai/openrouter";
import { AI_TITLES_PLATFORM_KEY, type AiTitlesSettings, getAiTitlesSettings } from "@/lib/ai/settings";
import { buildTitlesRequest } from "@/lib/ai/titles-prompt";
import { parseTitlesResponse } from "@/lib/ai/titles-response";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { getOpenRouterSettings } from "@/lib/env";
import { AppError } from "@/lib/http/errors";
import { readPlanTitlePage, requirePlanPage, savePageAiProposal } from "@/lib/modules/strategy/service";
import type { StrategyAiProposal } from "@/lib/modules/strategy/types";
import { logger } from "@/lib/observability/logger";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

/** Attesa massima della risposta del modello, dentro la maxDuration di 30 s della rotta (T-3601). */
const REQUEST_TIMEOUT_MS = 20_000;

type Actor = { id: string; isRootAdmin: boolean };

/**
 * Limite del workspace, poi tetto della piattaforma, entrambi nelle ultime 24 ore con il max delle impostazioni del root
 * admin (T-3601): il primo che blocca risponde 429 RATE_LIMITED con Retry-After. Ogni tentativo ammesso resta contato
 * anche se la chiamata poi fallisce. Il root admin è escluso da entrambi e non entra nelle proposte contate (D-43).
 */
async function consumeLimits(actor: Actor, workspaceId: string, settings: AiTitlesSettings): Promise<void> {
  if (actor.isRootAdmin) return;
  const rules = rateLimitRules();
  await enforceRateLimits([
    {
      key: `ai-titles:workspace:${workspaceId}`,
      rule: { max: settings.workspaceDailyLimit, windowSeconds: rules.aiTitlesWorkspace.windowSeconds },
    },
    { key: AI_TITLES_PLATFORM_KEY, rule: { max: settings.platformDailyLimit, windowSeconds: rules.aiTitlesPlatform.windowSeconds } },
  ]);
}

/**
 * Proposta di H1 e H2 per una pagina del piano corrente (T-3601, D-42 emendata da D-43): permessi di modifica del
 * piano e pagina (404, 409 STRATEGY_READ_ONLY), poi funzione accesa e chiave presente (503 AI_NOT_CONFIGURED senza
 * consumare i limiti), poi i limiti, la chiamata a OpenRouter e il controllo della risposta. La proposta riuscita
 * sostituisce quella salvata nella pagina; titoli e version del piano non cambiano. Nel log solo id, modello, durata ed
 * esito (CWE-532).
 */
export async function suggestPageTitles(actor: Actor, projectId: string, strategyId: string, pageId: string): Promise<StrategyAiProposal> {
  const project = await requireProjectAccess(actor, projectId, "strategy.write", {});
  await requirePlanPage(project, strategyId, pageId);
  const settings = await getAiTitlesSettings();
  const openRouter = getOpenRouterSettings();
  if (!settings.enabled || !openRouter) {
    throw new AiTitlesError("AI_NOT_CONFIGURED", "I titoli con l'AI non sono attivi");
  }
  const { language, page } = await readPlanTitlePage(project, strategyId, pageId);
  await consumeLimits(actor, project.workspace_id, settings);

  const startedAt = Date.now();
  let model = settings.model;
  let outcome = "ok";
  try {
    const completion = await requestCompletion(buildTitlesRequest(page, { language, model }), {
      ...openRouter,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    model = completion.model;
    const proposal: StrategyAiProposal = {
      ...parseTitlesResponse(completion.content, page, language),
      model,
      createdAt: new Date().toISOString(),
    };
    await savePageAiProposal(project, strategyId, pageId, proposal);
    return proposal;
  } catch (error) {
    outcome = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    throw error;
  } finally {
    logger.info("ai_titles_suggest", { workspaceId: project.workspace_id, pageId, model, durationMs: Date.now() - startedAt, outcome });
  }
}

/**
 * Scarta la proposta salvata nella pagina (T-3602): stessi permessi e controlli della proposta; senza proposta salvata
 * non cambia nulla. Nessun'altra colonna e nessuna version cambiano.
 */
export async function discardPageProposal(actor: { id: string }, projectId: string, strategyId: string, pageId: string): Promise<void> {
  const project = await requireProjectAccess(actor, projectId, "strategy.write", {});
  await requirePlanPage(project, strategyId, pageId);
  await savePageAiProposal(project, strategyId, pageId, null);
}
