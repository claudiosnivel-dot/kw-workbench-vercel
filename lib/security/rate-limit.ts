import { Prisma } from "@/lib/generated/prisma/client";
import { RateLimitedError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { maxRateLimitWindowSeconds, type RateLimitRule } from "@/lib/security/rate-limit-config";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

// SQL statico in frammenti costanti; la chiave è sempre un parametro legato.
const ADVISORY_LOCK = Prisma.sql`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtext(`;
const CLOSE_LOCK = Prisma.sql`))`;

/**
 * Consumo di un tentativo con una finestra scorrevole (sliding log, T-1701): nella transazione un advisory lock per
 * chiave serializza le richieste concorrenti (CWE-362), poi si eliminano le righe della chiave uscite dalla finestra, si
 * contano le rimaste e si inserisce il tentativo solo sotto la soglia. Bloccato: retryAfterSeconds sono i secondi finché
 * la riga più vecchia esce dalla finestra, arrotondati per eccesso e almeno 1. now è l'orologio dell'app (i test lo
 * spostano), mai now() del DB.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule, now: Date = new Date()): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`${ADVISORY_LOCK}${key}${CLOSE_LOCK}`;
    await tx.rateLimitHit.deleteMany({ where: { key, created_at: { lte: new Date(now.getTime() - windowMs) } } });
    const hits = await tx.rateLimitHit.count({ where: { key } });
    if (hits < rule.max) {
      await tx.rateLimitHit.create({ data: { key, created_at: now } });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const oldest = await tx.rateLimitHit.findFirst({ where: { key }, orderBy: { created_at: "asc" }, select: { created_at: true } });
    const exitsAt = (oldest?.created_at.getTime() ?? now.getTime()) + windowMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((exitsAt - now.getTime()) / 1000)) };
  });
}

/** Consuma le regole nell'ordine dato: la prima che blocca interrompe con 429 RATE_LIMITED e Retry-After (T-1701). */
export async function enforceRateLimits(checks: { key: string; rule: RateLimitRule }[]): Promise<void> {
  for (const { key, rule } of checks) {
    const result = await consumeRateLimit(key, rule);
    if (!result.allowed) {
      throw new RateLimitedError(result.retryAfterSeconds);
    }
  }
}

/** Pulizia globale (T-1701): elimina i tentativi più vecchi della finestra più lunga configurata; restituisce quanti. */
export async function pruneRateLimitHits(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - maxRateLimitWindowSeconds() * 1000);
  const { count } = await prisma.rateLimitHit.deleteMany({ where: { created_at: { lte: before } } });
  return count;
}
