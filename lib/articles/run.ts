import { after } from "next/server";
import { AiTitlesError } from "@/lib/ai/errors";
import { checksPhase } from "@/lib/articles/checks";
import { faqPhase } from "@/lib/articles/faq";
import { outlinePhase } from "@/lib/articles/outline";
import { type PhaseContext, REQUEST_DEADLINE_MS, type RunLease, RunLeaseLostError, writeRun } from "@/lib/articles/run-context";
import { sectionsPhase } from "@/lib/articles/sections";
import { getIntEnv } from "@/lib/env";
import type { ArticleRunScope, JobStatus } from "@/lib/generated/prisma/client";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { scheduleArticleRunContinuation } from "@/lib/modules/jobs/continuation";
import { articleRunStepId, verifyJobStep } from "@/lib/modules/jobs/job-signature";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { staleWhere } from "@/lib/modules/jobs/reaper";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/*
 * Motore dei lavori degli articoli (T-4101, D-46): lo schema delle ricerche (T-1202, T-1203) per richieste da circa 10
 * secondi. Un passo prende la lease, esegue le fasi finché resta tempo per un'altra richiesta e salva dopo ogni
 * richiesta; la continuazione è una POST firmata verso la rotta interna, e il cron reap-jobs riprende i lavori fermi.
 */

/** Un passo dura al massimo 270 s e la lease scade 30 s dopo: dentro la maxDuration di 300 s della rotta interna. */
const STEP_BUDGET_MS = 270_000;
const LEASE_GRACE_MS = 30_000;
const DONE_PHASE = "done";

/** Esiti salvati in error_code del lavoro e dell'articolo quando una fase fallisce. */
export type ArticleRunErrorCode = "AI_BUSY" | "AI_DAILY_LIMIT" | "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE" | "INTERNAL_ERROR";

type Phase = { name: string; run: (context: PhaseContext) => Promise<void> };

/** Fasi del lavoro dell'articolo intero, in ordine: scaletta (T-4102), blocchi (T-4201), FAQ (T-4202) e controlli (T-4302). */
const ARTICLE_PHASES: Phase[] = [
  { name: "outline", run: outlinePhase },
  { name: "sections", run: sectionsPhase },
  { name: "faq", run: faqPhase },
  { name: "checks", run: checksPhase },
];

/**
 * Fasi della riscrittura di un blocco (scope SECTION, modulo 44): il lavoro nasce nella fase sections, che riscrive
 * un'introduzione o un H2; la fase faq riscrive il blocco FAQ. Ognuna salta il blocco che non è suo; la fase checks
 * controlla il blocco riscritto e ricalcola il rapporto SEO dell'articolo.
 */
const SECTION_PHASES: Phase[] = ARTICLE_PHASES.slice(1);

const phasesOf = (scope: ArticleRunScope) => (scope === "SECTION" ? SECTION_PHASES : ARTICLE_PHASES);

function nextPhaseOf(scope: ArticleRunScope, phase: string): string {
  const phases = phasesOf(scope);
  return phases[phases.findIndex((item) => item.name === phase) + 1]?.name ?? DONE_PHASE;
}

export type ArticleStepResult = { status: JobStatus; phase: string; more: boolean; skipped?: "lease_busy" };

function readRun(runId: string) {
  return prisma.articleRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      article_id: true,
      workspace_id: true,
      scope: true,
      section_id: true,
      instruction: true,
      status: true,
      phase: true,
      cursor: true,
      progress_total: true,
      locked_until: true,
      article: { select: { project_id: true, created_by: { select: { is_root_admin: true } } } },
    },
  });
}

type RunRecord = NonNullable<Awaited<ReturnType<typeof readRun>>>;

const errorCodeOf = (error: AiTitlesError): ArticleRunErrorCode =>
  error.code === "AI_BUSY" || error.code === "AI_DAILY_LIMIT" || error.code === "AI_INVALID_RESPONSE" ? error.code : "AI_UNAVAILABLE";

/**
 * Porta a failed un lavoro ancora attivo con l'esito e, se era la generazione dell'intero articolo, l'articolo in
 * generazione a FAILED con lo stesso error_code. false se il lavoro era già terminato (completato, annullato, fallito).
 */
export async function failArticleRun(runId: string, code: ArticleRunErrorCode): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const [run] = await tx.articleRun.updateManyAndReturn({
      where: { id: runId, status: { in: ACTIVE_JOB_STATUSES } },
      data: { status: "failed", error_code: code, locked_until: null },
      select: { article_id: true, scope: true },
    });
    if (!run) return false;
    if (run.scope === "ARTICLE") {
      await tx.article.updateMany({ where: { id: run.article_id, status: "GENERATING" }, data: { status: "FAILED", error_code: code } });
    }
    logger.error("article_run_failed", { runId, code });
    return true;
  });
}

/** Lavoro senza fasi rimaste: completed con l'avanzamento pieno e, per l'articolo intero, l'articolo READY. */
async function completeRun(run: RunRecord, lease: RunLease): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await writeRun(tx, lease, { status: "completed", locked_until: null, progress_done: run.progress_total });
    if (run.scope === "ARTICLE") {
      await tx.article.updateMany({ where: { id: run.article_id, status: "GENERATING" }, data: { status: "READY", error_code: null } });
    }
  });
}

function phaseContext(run: RunRecord, lease: RunLease, deadlineMs: number): PhaseContext {
  return {
    run: {
      id: run.id,
      articleId: run.article_id,
      projectId: run.article.project_id,
      workspaceId: run.workspace_id,
      byRootAdmin: run.article.created_by?.is_root_admin ?? false,
      phase: run.phase,
      scope: run.scope,
      sectionId: run.section_id,
      instruction: run.instruction,
      cursor: run.cursor,
    },
    lease,
    deadlineMs,
    nextPhase: nextPhaseOf(run.scope, run.phase),
  };
}

/**
 * Avanza il lavoro fino a deadlineMs (istante assoluto in ms epoch), come advanceJob (T-1202): lease con
 * compare-and-set (CWE-362), altrimenti skipped='lease_busy' senza lavoro. Esegue sempre almeno una fase; prima di ogni
 * fase successiva, se non restano 120 s per una richiesta, rilascia la lease e ritorna more=true. Un lavoro annullato
 * (DELETE .../article/run) fa perdere la lease: il passo si ferma senza scrivere. Un errore dell'AI porta il lavoro a
 * failed e l'articolo a FAILED; ogni altra eccezione esce, e la conta runArticleStep.
 */
export async function advanceArticleRun(runId: string, deadlineMs: number): Promise<ArticleStepResult> {
  // Timestamp dell'applicazione e non now() del DB: i test spostano l'orologio con vi.setSystemTime.
  const now = new Date();
  const lease: RunLease = { runId, lockedUntil: new Date(Math.floor(deadlineMs) + LEASE_GRACE_MS) };
  const acquired = await prisma.articleRun.updateMany({
    where: { id: runId, status: { in: ACTIVE_JOB_STATUSES }, OR: [{ locked_until: null }, { locked_until: { lt: now } }] },
    data: { status: "running", locked_until: lease.lockedUntil, heartbeat_at: now },
  });

  for (let step = 0; ; step += 1) {
    const run = await readRun(runId);
    const leased = acquired.count === 1 && run?.status === "running" && run.locked_until?.getTime() === lease.lockedUntil.getTime();
    if (!run || !leased) {
      const status = run?.status ?? "canceled";
      return { status, phase: run?.phase ?? DONE_PHASE, more: false, ...(status === "running" || status === "pending" ? { skipped: "lease_busy" as const } : {}) };
    }
    if (run.phase !== DONE_PHASE && step > 0 && deadlineMs - Date.now() < REQUEST_DEADLINE_MS) {
      await prisma.articleRun.updateMany({ where: { id: runId, locked_until: lease.lockedUntil }, data: { locked_until: null } });
      return { status: run.status, phase: run.phase, more: true };
    }

    try {
      if (run.phase === DONE_PHASE) {
        await completeRun(run, lease);
      } else {
        const phase = phasesOf(run.scope).find((item) => item.name === run.phase);
        if (!phase) throw new Error(`Lavoro ${runId}: fase sconosciuta ${run.phase}`);
        await phase.run(phaseContext(run, lease, deadlineMs));
      }
    } catch (error) {
      if (error instanceof RunLeaseLostError) continue;
      if (!(error instanceof AiTitlesError)) throw error;
      await failArticleRun(runId, errorCodeOf(error));
      return { status: "failed", phase: run.phase, more: false };
    }
  }
}

/**
 * Eccezione non gestita in un passo: una riga di log con id e fase, tentativo contato, lease rilasciata e nuova
 * continuazione; al tetto JOB_MAX_ATTEMPTS il lavoro è failed e l'articolo FAILED con INTERNAL_ERROR.
 */
async function countFailedStep(runId: string, error: unknown): Promise<void> {
  const [run] = await prisma.articleRun.updateManyAndReturn({
    where: { id: runId, status: { in: ACTIVE_JOB_STATUSES } },
    data: { attempts: { increment: 1 }, locked_until: null },
    select: { phase: true, attempts: true },
  });
  logger.error("article_run_step_failed", { runId, phase: run?.phase ?? null, error });
  if (!run) return;
  if (run.attempts >= getIntEnv("JOB_MAX_ATTEMPTS")) {
    await failArticleRun(runId, "INTERNAL_ERROR");
  } else {
    scheduleArticleRunContinuation(runId);
  }
}

/** Un passo del lavoro in background: advanceArticleRun per 270 s, poi il passo successivo se serve. */
export async function runArticleStep(runId: string): Promise<void> {
  try {
    const step = await advanceArticleRun(runId, Date.now() + STEP_BUDGET_MS);
    if (step.more) scheduleArticleRunContinuation(runId);
  } catch (error) {
    await countFailedStep(runId, error);
  }
}

/**
 * Passo chiesto dalla rotta interna (T-4101): solo con la firma HMAC di articleRunStepId e la sua scadenza, così la firma
 * di un job delle ricerche con lo stesso id non vale (CWE-345); altrimenti 401 senza letture né scritture sul lavoro. Il
 * passo gira in after(), dopo la risposta 202.
 */
export function acceptArticleRunStep(runId: string, headers: Headers): void {
  if (!verifyJobStep(articleRunStepId(runId), headers.get("x-job-expires"), headers.get("x-job-signature"))) {
    throw new AppError(401, JOB_ERROR_CODES.signatureInvalid, "Firma della continuazione non valida");
  }
  after(() => runArticleStep(runId));
}

/**
 * Lavori degli articoli fermi (T-4101), dal cron reap-jobs: attivi, senza lease valida e senza battito da
 * JOB_STALE_AFTER_MS, come i job (T-1203). Ognuno riparte con un updateMany condizionale che conta il tentativo, così
 * una consegna doppia del cron non lo riprende due volte; con JOB_MAX_ATTEMPTS tentativi è failed e l'articolo FAILED.
 */
export async function reapStaleArticleRuns(limit = 50): Promise<{ resumed: number; failed: number }> {
  const now = new Date();
  const where = staleWhere(now);
  const maxAttempts = getIntEnv("JOB_MAX_ATTEMPTS");
  const totals = { resumed: 0, failed: 0 };
  const stale = await prisma.articleRun.findMany({ where, orderBy: { created_at: "asc" }, take: limit, select: { id: true, attempts: true } });
  for (const run of stale) {
    if (run.attempts >= maxAttempts) {
      if (await failArticleRun(run.id, "INTERNAL_ERROR")) totals.failed += 1;
      continue;
    }
    const resumed = await prisma.articleRun.updateMany({ where: { ...where, id: run.id }, data: { attempts: { increment: 1 }, heartbeat_at: now } });
    if (resumed.count === 1) {
      totals.resumed += 1;
      scheduleArticleRunContinuation(run.id);
    }
  }
  return totals;
}
