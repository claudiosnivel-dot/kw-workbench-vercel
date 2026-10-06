import { getUsdEnv } from "@/lib/env";
import { Prisma, type MetricsProvider } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Registro delle richieste al fornitore di metriche e tetti di spesa (T-903, D-30). Ogni richiesta è prenotata
// con il costo stimato prima dell'invio e chiusa con il costo restituito; il controllo dei tetti e la
// prenotazione avvengono sotto un advisory lock, così due estrazioni parallele non superano il tetto insieme.

// Chiave fissa dell'advisory lock della prenotazione (SQL statico, nessun valore interpolato).
const BUDGET_LOCK = Prisma.sql`SELECT pg_advisory_xact_lock(903903)`;

export type BudgetNotice = "METRICS_BUDGET_EXCEEDED" | "RUN_BUDGET_EXCEEDED";

export type Reservation = { ok: true; id: string } | { ok: false; notice: BudgetNotice };

type Client = Prisma.TransactionClient | typeof prisma;

/** Importo in decimi di millesimo di dollaro, la precisione di Decimal(10,4): confronti senza errori di arrotondamento. */
function toUnits(usd: number): number {
  return Math.round(usd * 10_000);
}

export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Speso delle righe indicate: cost_usd per le richieste chiuse, estimated_cost_usd per quelle ancora in corso. */
async function spent(client: Client, where: Prisma.MetricsProviderRequestWhereInput): Promise<number> {
  const settled = await client.metricsProviderRequest.aggregate({
    _sum: { cost_usd: true },
    where: { ...where, status: { not: "pending" } },
  });
  const pending = await client.metricsProviderRequest.aggregate({
    _sum: { estimated_cost_usd: true },
    where: { ...where, status: "pending" },
  });
  return Number(settled._sum.cost_usd ?? 0) + Number(pending._sum.estimated_cost_usd ?? 0);
}

/**
 * Prenota una richiesta se lo speso del mese UTC e quello dell'estrazione (le richieste già prenotate da questa
 * estrazione) più il costo stimato restano entro i tetti; altrimenti nessuna riga e il motivo del blocco.
 */
export async function reserveProviderRequest(input: {
  provider: MetricsProvider;
  projectId?: string;
  jobId?: string;
  keywordCount: number;
  runRequestIds: string[];
}): Promise<Reservation> {
  const estimate = getUsdEnv("METRICS_COST_PER_REQUEST_USD");
  const monthlyBudget = getUsdEnv("METRICS_MONTHLY_BUDGET_USD");
  const runBudget = getUsdEnv("METRICS_RUN_BUDGET_USD");

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw(BUDGET_LOCK);

    const monthSpent = await spent(tx, { created_at: { gte: monthStartUtc() } });
    if (toUnits(monthSpent) + toUnits(estimate) > toUnits(monthlyBudget)) {
      return { ok: false, notice: "METRICS_BUDGET_EXCEEDED" } as const;
    }
    // L'estrazione a passi (T-1202) arricchisce a batch in chiamate distinte: contano anche le richieste già
    // registrate per lo stesso job.
    const runWhere: Prisma.MetricsProviderRequestWhereInput[] = [{ id: { in: input.runRequestIds } }];
    if (input.jobId) {
      runWhere.push({ job_id: input.jobId });
    }
    const runSpent = input.runRequestIds.length > 0 || input.jobId ? await spent(tx, { OR: runWhere }) : 0;
    if (toUnits(runSpent) + toUnits(estimate) > toUnits(runBudget)) {
      return { ok: false, notice: "RUN_BUDGET_EXCEEDED" } as const;
    }

    const row = await tx.metricsProviderRequest.create({
      data: {
        provider: input.provider,
        project_id: input.projectId ?? null,
        job_id: input.jobId ?? null,
        keyword_count: input.keywordCount,
        estimated_cost_usd: estimate,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id } as const;
  });
}

/** Chiude la prenotazione con il costo restituito dal fornitore (0 se assente), anche per le richieste fallite. */
export async function settleProviderRequest(id: string, costUsd: number, succeeded: boolean): Promise<void> {
  await prisma.metricsProviderRequest.update({
    where: { id },
    data: { cost_usd: costUsd, status: succeeded ? "completed" : "failed" },
  });
}

/** Istanti (ms, in ordine) delle richieste registrate da tutte le istanze a partire da `since`. */
export async function recentProviderRequestTimes(provider: MetricsProvider, since: Date): Promise<number[]> {
  const rows = await prisma.metricsProviderRequest.findMany({
    where: { provider, created_at: { gte: since } },
    select: { created_at: true },
    orderBy: { created_at: "asc" },
  });
  return rows.map((row: { created_at: Date }) => row.created_at.getTime());
}

/** Spesa del mese UTC corrente per il root admin. */
export async function getMetricsSpend(now: Date = new Date()) {
  const where = { created_at: { gte: monthStartUtc(now) } };
  const [spentUsd, totals] = await Promise.all([
    spent(prisma, where),
    prisma.metricsProviderRequest.aggregate({ _count: { _all: true }, _sum: { keyword_count: true }, where }),
  ]);
  return {
    month: monthStartUtc(now).toISOString().slice(0, 7),
    spentUsd: toUnits(spentUsd) / 10_000,
    budgetUsd: getUsdEnv("METRICS_MONTHLY_BUDGET_USD"),
    requests: totals._count._all,
    keywords: totals._sum.keyword_count ?? 0,
  };
}
