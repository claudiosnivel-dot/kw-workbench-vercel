import { Prisma } from "@/lib/generated/prisma/client";
import { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import type { PlatformKpi } from "@/lib/admin/kpi-types";
import { prisma } from "@/lib/prisma";

/**
 * Indicatori aggregati della piattaforma per il root admin (T-1705): solo conteggi e somme, mai nomi di progetto,
 * keyword, seed, email o nomi degli utenti (CWE-359). Le chiavi di primo livello sono la whitelist KPI_KEYS.
 */
export const KPI_KEYS = ["users", "workspaces", "subscriptions", "mrr", "extractionsPerDay", "failedJobRate7d"] as const;

const DAY_MS = 86_400_000;
const EXTRACTION_DAYS = 30;
const FAILURE_WINDOW_DAYS = 7;
// Abbonamenti che contano nell'MRR: pagati o nella tolleranza del pagamento scaduto.
const MRR_STATUSES: SubscriptionStatus[] = ["active", "past_due"];

// SQL statico in frammenti costanti; l'istante di partenza è un parametro legato.
const JOBS_PER_DAY = Prisma.sql`SELECT to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS "day", count(*)::int AS "count" FROM "jobs" WHERE "created_at" >=`;
const GROUP_BY_DAY = Prisma.sql`GROUP BY 1`;

/** Mesi di un ciclo di fatturazione di Paddle (interval e frequency salvati da T-1603); null se sconosciuto. */
function cycleMonths(interval: string | null, frequency: number | null): number | null {
  const count = frequency ?? 1;
  switch (interval) {
    case "month":
      return count;
    case "year":
      return 12 * count;
    case "week":
      return (count * 12) / 52;
    case "day":
      return (count * 12) / 365;
    default:
      return null;
  }
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function estimateMrr(): Promise<Record<string, number>> {
  const groups = await prisma.workspaceSubscription.groupBy({
    by: ["currency_code", "billing_interval", "billing_frequency", "quantity"],
    where: { status: { in: MRR_STATUSES }, currency_code: { not: null }, recurring_amount_minor: { not: null } },
    _sum: { recurring_amount_minor: true },
  });
  const totals: Record<string, number> = {};
  for (const group of groups) {
    const months = cycleMonths(group.billing_interval, group.billing_frequency);
    const amount = group._sum.recurring_amount_minor;
    if (!group.currency_code || months === null || amount === null) {
      continue;
    }
    totals[group.currency_code] = (totals[group.currency_code] ?? 0) + (Number(amount) * (group.quantity ?? 1)) / months;
  }
  return Object.fromEntries(Object.entries(totals).map(([currency, value]) => [currency, Math.round(value)]));
}

async function extractionsPerDay(now: Date): Promise<PlatformKpi["extractionsPerDay"]> {
  const since = new Date(utcDay(now).getTime() - (EXTRACTION_DAYS - 1) * DAY_MS);
  const rows = await prisma.$queryRaw<{ day: string; count: number }[]>`${JOBS_PER_DAY} ${since} ${GROUP_BY_DAY}`;
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: EXTRACTION_DAYS }, (_, index) => {
    const date = new Date(since.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });
}

async function failedJobRate(now: Date): Promise<number | null> {
  const groups = await prisma.job.groupBy({
    by: ["status"],
    where: { created_at: { gte: new Date(now.getTime() - FAILURE_WINDOW_DAYS * DAY_MS) }, status: { in: ["completed", "failed"] } },
    _count: { _all: true },
  });
  const count = (status: string) => groups.find((group) => group.status === status)?._count._all ?? 0;
  const finished = count("completed") + count("failed");
  return finished === 0 ? null : count("failed") / finished;
}

export async function getPlatformKpi(now: Date = new Date()): Promise<PlatformKpi> {
  const [userGroups, workspaces, byPlanGroups, byStatusGroups, mrr, perDay, failedJobRate7d] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.workspace.count(),
    prisma.workspaceSubscription.groupBy({ by: ["plan_id"], _count: { _all: true } }),
    prisma.workspaceSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    estimateMrr(),
    extractionsPerDay(now),
    failedJobRate(now),
  ]);
  const usersWith = (status: string) => userGroups.find((group) => group.status === status)?._count._all ?? 0;
  const byStatus = Object.fromEntries(Object.values(SubscriptionStatus).map((status) => [status, 0])) as Record<SubscriptionStatus, number>;
  for (const group of byStatusGroups) {
    byStatus[group.status] = group._count._all;
  }

  return {
    users: {
      total: userGroups.reduce((sum, group) => sum + group._count._all, 0),
      active: usersWith("ACTIVE"),
      suspended: usersWith("SUSPENDED"),
    },
    workspaces: { total: workspaces },
    subscriptions: { byPlan: Object.fromEntries(byPlanGroups.map((group) => [group.plan_id, group._count._all])), byStatus },
    mrr,
    extractionsPerDay: perDay,
    failedJobRate7d,
  };
}
