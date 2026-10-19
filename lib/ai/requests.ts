import type { ModelUsage, UsageCounts } from "@/lib/ai/usage";
import type { AiFeature, AiRequestOutcome, Prisma } from "@/lib/generated/prisma/client";
import { RateLimitedError } from "@/lib/http/errors";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

/*
 * Registro delle richieste a OpenRouter (T-3901, D-46): una riga per ogni tentativo verso un modello, con funzione,
 * modello, esito, status HTTP, durata, workspace e root admin; mai testi, keyword o messaggi del fornitore (CWE-532).
 * Le righe delle ultime 24 ore sono il tetto della piattaforma, condiviso da titoli e articoli; quelle degli ultimi 7
 * giorni il contatore per modello del root admin (T-3902). Conservate 30 giorni.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const RETENTION_MS = 30 * DAY_MS;

/** Chi ha chiesto: la funzione dell'app, il workspace (null senza) e se è il root admin, escluso dal tetto (D-43). */
export type AiRequestContext = { feature: AiFeature; workspaceId: string | null; byRootAdmin: boolean };

type RecordedAttempt = { model: string; outcome: AiRequestOutcome; httpStatus: number | null; durationMs: number };

/**
 * Scrive la riga di un tentativo con il client globale, fuori da ogni transazione di chi chiama. Una scrittura non
 * riuscita non ferma la richiesta: resta il log ai_request_record_failed con funzione, modello ed esito.
 */
export async function recordAiRequest(context: AiRequestContext, attempt: RecordedAttempt): Promise<void> {
  try {
    await prisma.aiRequest.create({
      data: {
        feature: context.feature,
        model: attempt.model,
        outcome: attempt.outcome,
        http_status: attempt.httpStatus,
        duration_ms: Math.max(0, Math.round(attempt.durationMs)),
        workspace_id: context.workspaceId,
        by_root_admin: context.byRootAdmin,
      },
    });
  } catch {
    logger.warn("ai_request_record_failed", { feature: context.feature, model: attempt.model, outcome: attempt.outcome });
  }
}

/** Righe contate dal tetto: le ultime 24 ore, senza quelle del root admin. */
const countedSince = (now: Date): Prisma.AiRequestWhereInput => ({ by_root_admin: false, created_at: { gt: new Date(now.getTime() - DAY_MS) } });

/** Richieste delle ultime 24 ore contate dal tetto della piattaforma. */
export async function countCountedRequests(now: Date = new Date()): Promise<number> {
  return prisma.aiRequest.count({ where: countedSince(now) });
}

/**
 * Tetto della piattaforma in richieste (T-3901): se le righe contate delle ultime 24 ore non lasciano posto per needed
 * richieste (una per i titoli, la stima di un articolo per gli articoli, T-4002), 429 RATE_LIMITED con Retry-After, i
 * secondi finché ne esce dalla finestra quanto basta per fare posto (arrotondati per eccesso, almeno 1). Il controllo
 * non prenota: le righe le scrive requestWithFallback a ogni tentativo.
 */
export async function enforcePlatformRequestCap(max: number, needed = 1, now: Date = new Date()): Promise<void> {
  const where = countedSince(now);
  const count = await prisma.aiRequest.count({ where });
  if (count + needed <= max) return;
  const freeing = await prisma.aiRequest.findFirst({
    where,
    orderBy: { created_at: "asc" },
    skip: Math.max(0, count + needed - max - 1),
    select: { created_at: true },
  });
  const exitsAt = (freeing?.created_at.getTime() ?? now.getTime()) + DAY_MS;
  throw new RateLimitedError(Math.max(1, Math.ceil((exitsAt - now.getTime()) / 1000)));
}

/** Conservazione di 30 giorni (cron del catalogo, T-3803): elimina le righe più vecchie e restituisce quante. */
export async function pruneAiRequests(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.aiRequest.deleteMany({ where: { created_at: { lte: new Date(now.getTime() - RETENTION_MS) } } });
  return count;
}

/** Almeno un 429 del limite giornaliero dell'account nelle ultime 24 ore, anche del root admin (avviso di T-3902). */
export async function hadAccountDailyLimit(now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - DAY_MS);
  return (await prisma.aiRequest.count({ where: { outcome: "account_daily_limit", created_at: { gt: since } } })) > 0;
}

const emptyCounts = (): UsageCounts => ({ requests: 0, ok: 0, providerBusy: 0, accountDailyLimit: 0, other: 0, avgOkMs: null });

/** Conteggi per modello ed esito dalla data indicata, di tutti, root admin compreso. */
async function usageSince(since: Date): Promise<Map<string, UsageCounts>> {
  const groups = await prisma.aiRequest.groupBy({
    by: ["model", "outcome"],
    where: { created_at: { gt: since } },
    _count: { _all: true },
    _avg: { duration_ms: true },
  });
  const byModel = new Map<string, UsageCounts>();
  for (const group of groups) {
    const counts = byModel.get(group.model) ?? emptyCounts();
    const count = group._count._all;
    counts.requests += count;
    if (group.outcome === "ok") {
      counts.ok += count;
      counts.avgOkMs = group._avg.duration_ms === null ? null : Math.round(group._avg.duration_ms);
    } else if (group.outcome === "provider_busy") {
      counts.providerBusy += count;
    } else if (group.outcome === "account_daily_limit") {
      counts.accountDailyLimit += count;
    } else {
      counts.other += count;
    }
    byModel.set(group.model, counts);
  }
  return byModel;
}

/**
 * Uso per modello del root admin (T-3902): ogni modello con righe negli ultimi 7 giorni, con le ultime 24 ore e gli
 * ultimi 7 giorni, dal più usato nella settimana; a parità per ID.
 */
export async function readModelUsage(now: Date = new Date()): Promise<ModelUsage[]> {
  const [day, week] = await Promise.all([usageSince(new Date(now.getTime() - DAY_MS)), usageSince(new Date(now.getTime() - WEEK_MS))]);
  return [...week.entries()]
    .map(([model, last7d]) => ({ model, last24h: day.get(model) ?? emptyCounts(), last7d }))
    .sort((a, b) => b.last7d.requests - a.last7d.requests || a.model.localeCompare(b.model));
}
