import packageJson from "@/package.json";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";

// Health check pubblico per il monitoraggio dell'uptime (T-603): solo SELECT 1 con un timeout breve e tre campi
// nella risposta, mai il messaggio dell'errore, l'host del DB o una variabile d'ambiente (CWE-200).

const DB_TIMEOUT_MS = 2_000;

function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || packageJson.version;
}

async function pingDatabase(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SELECT 1 oltre ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function health(): Promise<Response> {
  const version = appVersion();
  const headers = { "Cache-Control": "no-store" };

  try {
    await pingDatabase();
    return Response.json({ status: "ok", db: "ok", version }, { headers });
  } catch (error) {
    logger.error("health_db_failed", { error });
    return Response.json({ status: "degraded", db: "error", version }, { status: 503, headers });
  }
}

export async function GET(): Promise<Response> {
  return health();
}

export async function HEAD(): Promise<Response> {
  const response = await health();
  return new Response(null, { status: response.status, headers: response.headers });
}
