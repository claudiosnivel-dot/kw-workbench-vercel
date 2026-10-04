import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { sslForDatabaseUrl } from "@/lib/db/ssl";
import { envInt, getIntEnv, INT_ENV, type EnvSource } from "@/lib/env";
import { PrismaClient } from "@/lib/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// pg chiude le connessioni inattive dopo 10 s (il vecchio engine dopo 300 s): valore esplicito.
const IDLE_TIMEOUT_MS = 10_000;

/**
 * Pool di pg dell'adapter. Con l'adapter connection_limit, pgbouncer e pool_timeout nell'URL non
 * governano più nulla: limite e attesa di una connessione arrivano dall'env validata (T-201).
 * Senza connectionTimeoutMillis pg attenderebbe una connessione libera all'infinito.
 */
export function buildPoolConfig(source: EnvSource = process.env): PoolConfig {
  const { min, max } = INT_ENV.PRISMA_CONNECTION_LIMIT;
  const defaultConnectionLimit = source.NODE_ENV === "production" ? 3 : 1;

  return {
    connectionString: source.DATABASE_URL,
    max: envInt("PRISMA_CONNECTION_LIMIT", defaultConnectionLimit, min, max, source),
    connectionTimeoutMillis: getIntEnv("PRISMA_POOL_TIMEOUT", source) * 1000,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    ssl: sslForDatabaseUrl(source.DATABASE_URL),
  };
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(buildPoolConfig()),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
