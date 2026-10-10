import { writeAuditLog } from "@/lib/admin/audit";
import { Prisma } from "@/lib/generated/prisma/client";
import type { UsageMetric } from "@/lib/generated/prisma/enums";
import type { UsageSummary } from "@/lib/billing/usage-types";
import { AppError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

/**
 * Quote d'uso per workspace (T-1703): contatori per periodo UTC in usage_counters, aggiornati solo con incrementi atomici
 * in SQL (CWE-362). Le quote si riservano solo con il lancio commerciale attivo (D-32); i limiti arrivano dai diritti
 * del piano letti prima della transazione (T-1605), mai dal client.
 */

const DAY_METRICS = new Set<UsageMetric>(["runs_day"]);

/** Inizio del periodo UTC della metrica: 00:00Z del giorno per runs_day, del primo giorno del mese per le altre. */
export function usagePeriodStart(metric: UsageMetric, now: Date): Date {
  return DAY_METRICS.has(metric)
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Inizio del periodo successivo (resetAt): mezzanotte UTC seguente o primo giorno del mese seguente. */
export function usageResetAt(metric: UsageMetric, now: Date): Date {
  const start = usagePeriodStart(metric, now);
  return DAY_METRICS.has(metric)
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1))
    : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/** 429 QUOTA_EXCEEDED con metrica, limite e azzeramento in ISO 8601 (T-1703). */
export class QuotaExceededError extends AppError {
  constructor(metric: "runs_day" | "keywords_month", limit: number, resetAt: Date) {
    super(429, "QUOTA_EXCEEDED", "Quota d'uso del workspace esaurita", { metric, limit, resetAt: resetAt.toISOString() });
    this.name = "QuotaExceededError";
  }
}

// SQL statico in frammenti costanti; workspace, metrica, periodo, quantità e limite sono sempre parametri legati.
const UPSERT_HEAD = Prisma.sql`INSERT INTO "usage_counters" ("workspace_id", "metric", "period_start", "count") VALUES (`;
const INCREMENT_WITHIN_LIMIT = Prisma.sql`) ON CONFLICT ("workspace_id", "metric", "period_start") DO UPDATE SET "count" = "usage_counters"."count" + EXCLUDED."count" WHERE "usage_counters"."count" + EXCLUDED."count" <=`;
const LOCK_AND_READ = Prisma.sql`) ON CONFLICT ("workspace_id", "metric", "period_start") DO UPDATE SET "count" = "usage_counters"."count"`;
const RETURNING_COUNT = Prisma.sql`RETURNING "count"`;

/**
 * Incremento condizionale atomico: count + amount solo se il risultato resta entro limit (INSERT ... ON CONFLICT DO
 * UPDATE ... WHERE). false se rifiutato; con amount oltre il limite rifiuta senza eseguire l'insert.
 */
export async function incrementWithinLimit(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; metric: UsageMetric; periodStart: Date; amount: number; limit: number }
): Promise<boolean> {
  if (input.amount > input.limit) {
    return false;
  }
  const rows = await tx.$queryRaw<{ count: number }[]>`${UPSERT_HEAD}${input.workspaceId}, ${input.metric}::"UsageMetric", ${input.periodStart}, ${input.amount}${INCREMENT_WITHIN_LIMIT} ${input.limit} ${RETURNING_COUNT}`;
  return rows.length === 1;
}

/** Riga del contatore creata se manca e bloccata fino al commit; restituisce il conteggio corrente. */
async function lockCounter(tx: Prisma.TransactionClient, workspaceId: string, metric: UsageMetric, periodStart: Date) {
  const [row] = await tx.$queryRaw<{ count: number }[]>`${UPSERT_HEAD}${workspaceId}, ${metric}::"UsageMetric", ${periodStart}, ${0}${LOCK_AND_READ} ${RETURNING_COUNT}`;
  return row.count;
}

/**
 * Riserva fino a requested unità di una quota mensile (keyword salvate, keyword arricchite dal fornitore con licenza):
 * sotto il lock della riga del contatore concede il minimo tra requested e il residuo, aumenta il contatore di quanto
 * concesso e lo restituisce.
 */
export async function reservePartialQuota(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; metric: UsageMetric; now: Date; requested: number; limit: number }
): Promise<number> {
  const periodStart = usagePeriodStart(input.metric, input.now);
  const used = await lockCounter(tx, input.workspaceId, input.metric, periodStart);
  const granted = Math.max(0, Math.min(input.requested, input.limit - used));
  if (granted > 0) {
    await tx.usageCounter.update({
      where: { workspace_id_metric_period_start: { workspace_id: input.workspaceId, metric: input.metric, period_start: periodStart } },
      data: { count: { increment: granted } },
    });
  }
  return granted;
}

async function counterValue(db: Prisma.TransactionClient, workspaceId: string, metric: UsageMetric, now: Date): Promise<number> {
  const row = await db.usageCounter.findUnique({
    where: { workspace_id_metric_period_start: { workspace_id: workspaceId, metric, period_start: usagePeriodStart(metric, now) } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

/** Limiti delle quote del workspace (diritti del piano, T-1601): null = illimitato. */
export type QuotaLimits = { runsPerDay: number | null; keywordsPerMonth: number | null };

/** Riserva dell'avvio salvata nel payload del job: workspace e giorno UTC dell'avvio, per il rimborso (D-27). */
export type RunReservation = { workspaceId: string; runsPeriodStart: string };

/**
 * Riserva di un avvio nella transazione che crea il job (T-1703): con keywords_month già al limite → 429 metric
 * keywords_month; poi l'incremento condizionale atomico di runs_day, che rifiutato → 429 metric runs_day.
 */
export async function reserveRun(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  limits: QuotaLimits,
  now: Date
): Promise<RunReservation> {
  if (limits.keywordsPerMonth !== null && (await counterValue(tx, workspaceId, "keywords_month", now)) >= limits.keywordsPerMonth) {
    throw new QuotaExceededError("keywords_month", limits.keywordsPerMonth, usageResetAt("keywords_month", now));
  }
  const runsPeriodStart = usagePeriodStart("runs_day", now);
  const limit = limits.runsPerDay ?? Number.MAX_SAFE_INTEGER;
  if (!(await incrementWithinLimit(tx, { workspaceId, metric: "runs_day", periodStart: runsPeriodStart, amount: 1, limit }))) {
    throw new QuotaExceededError("runs_day", limit, usageResetAt("runs_day", now));
  }
  return { workspaceId, runsPeriodStart: runsPeriodStart.toISOString() };
}

/** Uso del workspace per la pagina di fatturazione e GET /api/billing/usage (T-1703). */
export async function getUsageSummary(workspaceId: string, limits: QuotaLimits, now: Date = new Date()): Promise<UsageSummary> {
  const [runsToday, keywordsThisMonth] = await Promise.all([
    counterValue(prisma, workspaceId, "runs_day", now),
    counterValue(prisma, workspaceId, "keywords_month", now),
  ]);
  return {
    runsToday,
    runsPerDay: limits.runsPerDay,
    keywordsThisMonth,
    keywordsPerMonth: limits.keywordsPerMonth,
    resetAt: {
      runs_day: usageResetAt("runs_day", now).toISOString(),
      keywords_month: usageResetAt("keywords_month", now).toISOString(),
    },
  };
}

/** Esito del rimborso di un avvio (D-27 emendata). */
export type RefundOutcome = "refunded" | "cap_reached" | "no_reservation";

/**
 * Finestra dell'annullamento gratuito (D-27 emendata il 2026-10-09, T-2002): un'estrazione annullata entro 60 secondi
 * dall'avvio (created_at del job) non consuma la quota. Costante di prodotto, non configurabile da env.
 */
export const FREE_CANCEL_WINDOW_MS = 60_000;

/** true se l'annullamento chiesto in requestedAt cade nella finestra gratuita del job creato in createdAt. */
export function isFreeCancel(createdAt: Date, requestedAt: Date): boolean {
  return requestedAt.getTime() - createdAt.getTime() <= FREE_CANCEL_WINDOW_MS;
}

/**
 * Restituzione dell'avvio riservato nella transazione che chiude il job: runs_day del giorno della riserva scende di 1,
 * mai sotto 0, e il job (nello stato indicato) è segnato quota_refunded.
 */
async function returnRunReservation(
  tx: Prisma.TransactionClient,
  input: { jobId: string; reservation: RunReservation; status: "failed" | "canceled" }
): Promise<void> {
  await tx.usageCounter.updateMany({
    where: {
      workspace_id: input.reservation.workspaceId,
      metric: "runs_day",
      period_start: new Date(input.reservation.runsPeriodStart),
      count: { gt: 0 },
    },
    data: { count: { decrement: 1 } },
  });
  await tx.job.updateMany({ where: { id: input.jobId, status: input.status }, data: { quota_refunded: true } });
}

/**
 * Annullamento gratuito (T-2002): nella transazione che porta il job a canceled l'avvio torna al workspace come per un
 * errore nostro, ma fuori dal tetto dei rimborsi automatici (run_refunds_month invariato, nessuna riga nel registro).
 */
export function releaseCanceledRun(tx: Prisma.TransactionClient, input: { jobId: string; reservation: RunReservation }): Promise<void> {
  return returnRunReservation(tx, { ...input, status: "canceled" });
}

/**
 * Rimborso dell'avvio di un job fallito per errore nostro (T-1703, D-27 emendata), nella transazione che lo porta a
 * failed: entro il tetto mensile dei rimborsi del workspace (incremento condizionale di run_refunds_month) runs_day del
 * giorno della riserva scende di 1, mai sotto 0, e il job è segnato quota_refunded. Oltre il tetto nessun rimborso e una
 * riga quota.refund_cap_reached nel registro delle azioni admin (T-1704), con actor null: il caso va all'admin.
 */
export async function refundRunReservation(
  tx: Prisma.TransactionClient,
  input: { jobId: string; reservation: RunReservation; refundCap: number; now: Date }
): Promise<RefundOutcome> {
  const { workspaceId } = input.reservation;
  const allowed = await incrementWithinLimit(tx, {
    workspaceId,
    metric: "run_refunds_month",
    periodStart: usagePeriodStart("run_refunds_month", input.now),
    amount: 1,
    limit: input.refundCap,
  });
  if (!allowed) {
    await writeAuditLog(tx, {
      actorUserId: null,
      action: "quota.refund_cap_reached",
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { jobId: input.jobId, refundCap: input.refundCap },
    });
    return "cap_reached";
  }

  await returnRunReservation(tx, { jobId: input.jobId, reservation: input.reservation, status: "failed" });
  return "refunded";
}
