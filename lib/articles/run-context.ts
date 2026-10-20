import { readModelCatalog } from "@/lib/ai/catalog";
import { AiTitlesError } from "@/lib/ai/errors";
import { modelStatus } from "@/lib/ai/models";
import { requestWithFallback } from "@/lib/ai/openrouter";
import { getAiTitlesSettings } from "@/lib/ai/settings";
import type { TitlesRequest } from "@/lib/ai/titles-prompt";
import { getOpenRouterSettings } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/observability/logger";

/*
 * Quello che una fase del lavoro di un articolo riceve dal motore (T-4101): il lavoro, la lease del passo, la scadenza e
 * la fase che segue; più la scrittura sotto lease e la richiesta al modello con i modelli di riserva.
 */

/** Attesa massima di un tentativo verso un modello e di una richiesta con tutti i modelli di riserva (T-4101). */
const ATTEMPT_TIMEOUT_MS = 45_000;
export const REQUEST_DEADLINE_MS = 120_000;

/** Lease del passo in corso: ogni scrittura del lavoro la richiede, così un passo che l'ha persa non scrive. */
export type RunLease = { runId: string; lockedUntil: Date };

/** Il passo non ha più la lease: lavoro annullato (DELETE .../article/run) o ripreso da un altro passo. */
export class RunLeaseLostError extends Error {
  constructor() {
    super("Lease del lavoro dell'articolo persa");
    this.name = "RunLeaseLostError";
  }
}

/** Lavoro passato a una fase: articolo, progetto e workspace, e se l'ha avviato il root admin (le sue righe non contano, D-43). */
export type PhaseRun = { id: string; articleId: string; projectId: string; workspaceId: string; byRootAdmin: boolean; phase: string };

export type PhaseContext = { run: PhaseRun; lease: RunLease; deadlineMs: number; nextPhase: string };

/** Richiesta al modello senza il modello: lo sceglie l'elenco delle impostazioni, uno alla volta. */
export type ModelRequest = Omit<TitlesRequest, "model">;

/** Aggiorna il lavoro solo se è ancora running con la lease di questo passo; heartbeat_at = adesso. */
export async function writeRun(tx: Prisma.TransactionClient, lease: RunLease, data: Prisma.ArticleRunUpdateManyMutationInput): Promise<void> {
  const { count } = await tx.articleRun.updateMany({
    where: { id: lease.runId, status: "running", locked_until: lease.lockedUntil },
    data: { ...data, heartbeat_at: new Date() },
  });
  if (count !== 1) {
    throw new RunLeaseLostError();
  }
}

/** Esito non riuscito della richiesta: tutti i tentativi con una risposta scartata dal controllo sono AI_INVALID_RESPONSE. */
function requestError(error: AiTitlesError, outcomes: string[]): AiTitlesError {
  if (outcomes.length > 0 && outcomes.every((outcome) => outcome === "invalid_response")) {
    return new AiTitlesError("AI_INVALID_RESPONSE", "Nessun modello dell'elenco ha dato una risposta valida");
  }
  return error;
}

/**
 * Una richiesta del lavoro (T-4101): modelli delle impostazioni del root admin in ordine (T-3802), saltando quelli assenti
 * dal catalogo (T-3803), con 45 s per tentativo e 120 s per tutta la richiesta, mai oltre la scadenza del passo; ogni
 * tentativo scrive la sua riga di ai_requests con funzione article e il workspace del lavoro (T-3901). Senza chiave
 * AI_UNAVAILABLE; senza una risposta valida AI_BUSY, AI_DAILY_LIMIT, AI_UNAVAILABLE o AI_INVALID_RESPONSE. Nel log solo
 * id, fase, modello, esito e tentativi, mai testi o keyword (CWE-532).
 */
export async function requestForRun<T>(
  context: PhaseContext,
  request: ModelRequest,
  validate: (content: string) => T
): Promise<{ value: T; model: string }> {
  const openRouter = getOpenRouterSettings();
  if (!openRouter) {
    throw new AiTitlesError("AI_UNAVAILABLE", "La chiave di OpenRouter non è configurata");
  }
  const [{ models }, catalog] = await Promise.all([getAiTitlesSettings(), readModelCatalog()]);
  const startedAt = Date.now();
  const result = await requestWithFallback({ model: models[0], ...request }, models, {
    ...openRouter,
    deadlineMs: Math.max(0, Math.min(REQUEST_DEADLINE_MS, context.deadlineMs - startedAt)),
    attemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    validate,
    skip: (model) => modelStatus(model, catalog) === "missing",
    record: { feature: "article", workspaceId: context.run.workspaceId, byRootAdmin: context.run.byRootAdmin },
  });
  logger.info("article_run_request", {
    runId: context.run.id,
    phase: context.run.phase,
    durationMs: Date.now() - startedAt,
    model: result.ok ? result.model : null,
    outcome: result.ok ? "ok" : result.error.code,
    attempts: result.attempts,
  });
  if (!result.ok) {
    throw requestError(result.error, result.attempts.map((attempt) => attempt.outcome));
  }
  return { value: result.value, model: result.model };
}
