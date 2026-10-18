import { readModelCatalog } from "@/lib/ai/catalog";
import { AiTitlesError } from "@/lib/ai/errors";
import { modelStatus } from "@/lib/ai/models";
import { type Attempt, requestWithFallback } from "@/lib/ai/openrouter";
import { AI_TITLES_PLATFORM_KEY, type AiTitlesSettings, getAiTitlesSettings } from "@/lib/ai/settings";
import { buildTitlesRequest } from "@/lib/ai/titles-prompt";
import { parseTitlesResponse } from "@/lib/ai/titles-response";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { getOpenRouterSettings } from "@/lib/env";
import { readPlanTitlePage, requirePlanPage, savePageAiProposal } from "@/lib/modules/strategy/service";
import type { StrategyAiProposal } from "@/lib/modules/strategy/types";
import { logger } from "@/lib/observability/logger";
import { enforceRateLimits } from "@/lib/security/rate-limit";
import { rateLimitRules } from "@/lib/security/rate-limit-config";

/** Attesa massima di un modello e di tutti i tentativi, dentro la maxDuration di 30 s della rotta (T-3601, T-3802). */
const ATTEMPT_TIMEOUT_MS = 20_000;
const DEADLINE_MS = 25_000;

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
 * consumare i limiti), poi i limiti e la richiesta con i modelli di riserva (T-3802), saltando quelli assenti dal
 * catalogo (T-3803), con parseTitlesResponse come controllo della risposta. La proposta riuscita riporta il modello che
 * ha risposto e sostituisce quella salvata nella pagina; titoli e version del piano non cambiano. Nel log solo id,
 * modello, durata, esito e per ogni tentativo modello, esito e status HTTP; mai keyword o messaggi del fornitore
 * (CWE-532).
 */
export async function suggestPageTitles(actor: Actor, projectId: string, strategyId: string, pageId: string): Promise<StrategyAiProposal> {
  const project = await requireProjectAccess(actor, projectId, "strategy.write", {});
  await requirePlanPage(project, strategyId, pageId);
  const settings = await getAiTitlesSettings();
  const openRouter = getOpenRouterSettings();
  if (!settings.enabled || !openRouter) {
    throw new AiTitlesError("AI_NOT_CONFIGURED", "I titoli con l'AI non sono attivi");
  }
  const [{ language, page }, catalog] = await Promise.all([readPlanTitlePage(project, strategyId, pageId), readModelCatalog()]);
  await consumeLimits(actor, project.workspace_id, settings);

  const startedAt = Date.now();
  const log = (fields: { model: string | null; outcome: string; attempts: Attempt[] }) =>
    logger.info("ai_titles_suggest", { workspaceId: project.workspace_id, pageId, durationMs: Date.now() - startedAt, ...fields });
  const result = await requestWithFallback(buildTitlesRequest(page, { language, model: settings.models[0] }), settings.models, {
    ...openRouter,
    deadlineMs: DEADLINE_MS,
    attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    validate: (content) => parseTitlesResponse(content, page, language),
    skip: (model) => modelStatus(model, catalog) === "missing",
  }).catch((error: unknown) => {
    log({ model: null, outcome: "INTERNAL_ERROR", attempts: [] });
    throw error;
  });
  log({ model: result.ok ? result.model : null, outcome: result.ok ? "ok" : result.error.code, attempts: result.attempts });
  if (!result.ok) throw result.error;

  const proposal: StrategyAiProposal = { ...result.value, model: result.model, createdAt: new Date().toISOString() };
  await savePageAiProposal(project, strategyId, pageId, proposal);
  return proposal;
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
