import { after } from "next/server";
import { setTimeout as sleep } from "node:timers/promises";
import { getIntEnv } from "@/lib/env";
import type { JobStatus } from "@/lib/generated/prisma/client";
import { AppError, JOB_ERROR_CODES } from "@/lib/http/errors";
import { schedulePlanRunContinuation } from "@/lib/modules/jobs/continuation";
import { planRunStepId, verifyJobStep } from "@/lib/modules/jobs/job-signature";
import { ACTIVE_JOB_STATUSES } from "@/lib/modules/jobs/job-state";
import { staleWhere } from "@/lib/modules/jobs/reaper";
import {
  PLAN_PHASES,
  PLAN_RUN_SELECT,
  type PlanRunLease,
  PlanRunLeaseLostError,
  type PlanRunMemo,
  type PlanRunRecord,
  writePlanRun,
} from "@/lib/modules/plan-runs/phases";
import type { PlanRunPhase } from "@/lib/modules/plan-runs/types";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/*
 * Motore dei lavori di piano (T-6201, D-57), sul modello dei lavori degli articoli (T-4101): un passo prende la lease,
 * esegue le fasi finché resta tempo e salva dopo ogni fase; la continuazione è una POST firmata con «plan-run:» più l'id,
 * e i lavori fermi riprendono dal cron reap-jobs o dalla lettura del loro stato (T-6202).
 */

/** Un passo dura al massimo 270 s e la lease scade 30 s dopo: dentro la maxDuration di 300 s della rotta interna. */
const PLAN_STEP_MS = 270_000;
const PLAN_LEASE_GRACE_MS = 30_000;
/** Tempo lasciato a una fase che non è la prima del passo: le chiamate a DataForSEO con i loro tentativi. */
const PHASE_MARGIN_MS = 60_000;

export type PlanStepResult = { status: JobStatus; phase: string; more: boolean; skipped?: "lease_busy" };

/** Codice d'errore del lavoro non riuscito: quello di un AppError (accesso perso, limite, perimetro) o INTERNAL_ERROR. */
type PlanRunErrorCode = string;

/** Porta a failed un lavoro ancora attivo con il codice; false se era già terminato. */
export async function failPlanRun(runId: string, code: PlanRunErrorCode): Promise<boolean> {
  const { count } = await prisma.planRun.updateMany({
    where: { id: runId, status: { in: ACTIVE_JOB_STATUSES } },
    data: { status: "failed", error_code: code, locked_until: null },
  });
  if (count === 1) logger.error("plan_run_failed", { runId, code });
  return count === 1;
}

/** Lavoro prendibile da un passo: attivo e senza una lease valida (CWE-362). */
const claimableWhere = (runId: string, now: Date) => ({
  id: runId,
  status: { in: ACTIVE_JOB_STATUSES },
  OR: [{ locked_until: null }, { locked_until: { lt: now } }],
});

const readPlanRun = (runId: string) => prisma.planRun.findUnique({ where: { id: runId }, select: PLAN_RUN_SELECT });

const holdsLease = (run: PlanRunRecord, lease: PlanRunLease) =>
  run.status === "running" && run.locked_until?.getTime() === lease.lockedUntil.getTime();

/** Rilascia la lease di questo passo: il passo successivo parte dalla continuazione. */
async function releaseLease(run: PlanRunRecord, lease: PlanRunLease): Promise<PlanStepResult> {
  await prisma.planRun.updateMany({ where: { id: run.id, locked_until: lease.lockedUntil }, data: { locked_until: null } });
  return { status: run.status, phase: run.phase, more: true };
}

/**
 * Avanza il lavoro fino a deadlineMs (istante assoluto in ms epoch): lease con compare-and-set, altrimenti
 * skipped='lease_busy' senza lavoro. Esegue sempre almeno una fase; prima di ogni fase successiva, o prima di attendere
 * una raccolta, se non restano 60 s rilascia la lease e ritorna more=true. Un AppError di una fase (accesso perso,
 * limite di strategie, perimetro vuoto) porta il lavoro a failed con il suo codice; ogni altra eccezione esce, e la conta
 * runPlanStep.
 */
export async function advancePlanRun(runId: string, deadlineMs: number): Promise<PlanStepResult> {
  // Timestamp dell'applicazione e non now() del DB: i test spostano l'orologio con vi.setSystemTime.
  const startedAt = new Date();
  const lease: PlanRunLease = { runId, lockedUntil: new Date(Math.floor(deadlineMs) + PLAN_LEASE_GRACE_MS) };
  const claim = await prisma.planRun.updateMany({
    where: claimableWhere(runId, startedAt),
    data: { status: "running", locked_until: lease.lockedUntil, heartbeat_at: startedAt },
  });
  const memo: PlanRunMemo = {};

  for (let ran = 0; ; ran += 1) {
    const run = await readPlanRun(runId);
    if (!run || claim.count !== 1 || !holdsLease(run, lease)) {
      const status = run?.status ?? "canceled";
      const busy = status === "pending" || status === "running";
      return { status, phase: run?.phase ?? "done", more: false, ...(busy ? { skipped: "lease_busy" as const } : {}) };
    }
    if (run.phase === "done") {
      await writePlanRun(prisma, lease, { status: "completed", locked_until: null });
      return { status: "completed", phase: run.phase, more: false };
    }
    if (ran > 0 && deadlineMs - Date.now() < PHASE_MARGIN_MS) return releaseLease(run, lease);

    const phase = PLAN_PHASES[run.phase as Exclude<PlanRunPhase, "done">];
    if (!phase) throw new Error(`Lavoro di piano ${runId}: fase sconosciuta ${run.phase}`);
    let outcome: Awaited<ReturnType<typeof phase>>;
    try {
      outcome = await phase({ run, lease, memo });
    } catch (error) {
      if (error instanceof PlanRunLeaseLostError) continue;
      if (!(error instanceof AppError)) throw error;
      await failPlanRun(runId, error.code);
      return { status: "failed", phase: run.phase, more: false };
    }
    if (outcome?.waitMs) {
      if (deadlineMs - Date.now() - outcome.waitMs < PHASE_MARGIN_MS) return releaseLease(run, lease);
      await sleep(outcome.waitMs);
    }
  }
}

/**
 * Eccezione non gestita in un passo: una riga di log con id e fase, tentativo contato, lease rilasciata e nuova
 * continuazione; al tetto JOB_MAX_ATTEMPTS il lavoro è failed con INTERNAL_ERROR e nessuna strategia nuova.
 */
async function countFailedPlanStep(runId: string, error: unknown): Promise<void> {
  const [run] = await prisma.planRun.updateManyAndReturn({
    where: { status: { in: ACTIVE_JOB_STATUSES }, id: runId },
    data: { locked_until: null, attempts: { increment: 1 } },
    select: { attempts: true, phase: true },
  });
  logger.error("plan_run_step_failed", { runId, phase: run?.phase ?? null, error });
  if (!run) return;
  if (run.attempts < getIntEnv("JOB_MAX_ATTEMPTS")) {
    schedulePlanRunContinuation(runId);
    return;
  }
  await failPlanRun(runId, "INTERNAL_ERROR");
}

/** Un passo del lavoro in background: advancePlanRun per 270 s, poi il passo successivo se serve. */
export async function runPlanStep(runId: string): Promise<void> {
  try {
    const result = await advancePlanRun(runId, Date.now() + PLAN_STEP_MS);
    if (result.more) schedulePlanRunContinuation(runId);
  } catch (error) {
    await countFailedPlanStep(runId, error);
  }
}

/**
 * Passo chiesto dalla rotta interna (T-6201): solo con la firma HMAC di planRunStepId e la sua scadenza, così la firma di
 * un job delle ricerche o di un lavoro di articolo con lo stesso id non vale (CWE-345); altrimenti 401 senza letture né
 * scritture sul lavoro. Il passo gira in after(), dopo la risposta 202.
 */
export function acceptPlanRunStep(runId: string, headers: Headers): void {
  const signed = verifyJobStep(planRunStepId(runId), headers.get("x-job-expires"), headers.get("x-job-signature"));
  if (!signed) throw new AppError(401, JOB_ERROR_CODES.signatureInvalid, "Firma della continuazione non valida");
  after(() => runPlanStep(runId));
}

/**
 * Lavori di piano fermi (T-6201), dal cron reap-jobs e, con runId, dalla lettura dello stato (T-6202): attivi, senza
 * lease valida e senza battito da JOB_STALE_AFTER_MS, come i job (T-1203). La ripresa è un updateMany condizionale che
 * conta il tentativo, così una consegna doppia del cron o due letture insieme non lo riprendono due volte; con
 * JOB_MAX_ATTEMPTS tentativi il lavoro è failed con INTERNAL_ERROR.
 */
export async function reapStalePlanRuns(options: { runId?: string; limit?: number } = {}): Promise<{ resumed: number; failed: number }> {
  const now = new Date();
  const stale = staleWhere(now);
  const candidates = await prisma.planRun.findMany({
    where: options.runId ? { AND: [stale, { id: options.runId }] } : stale,
    orderBy: { created_at: "asc" },
    take: options.limit ?? 50,
    select: { id: true, attempts: true },
  });
  const maxAttempts = getIntEnv("JOB_MAX_ATTEMPTS");
  let resumed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (candidate.attempts >= maxAttempts) {
      failed += Number(await failPlanRun(candidate.id, "INTERNAL_ERROR"));
      continue;
    }
    const taken = await prisma.planRun.updateMany({ where: { AND: [stale, { id: candidate.id }] }, data: { attempts: { increment: 1 }, heartbeat_at: now } });
    if (taken.count === 1) {
      resumed += 1;
      schedulePlanRunContinuation(candidate.id);
    }
  }
  return { resumed, failed };
}
