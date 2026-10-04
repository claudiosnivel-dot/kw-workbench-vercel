import { Prisma, PrismaClient } from "@prisma/client";
import { envInt, getIntEnv, INT_ENV } from "@/lib/env";

declare global {
  var prisma: PrismaClient | undefined;
}

function getTunedDatasourceUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const isSupabasePooler = parsed.hostname.endsWith(".pooler.supabase.com");

  if (!isSupabasePooler) {
    return rawUrl;
  }

  // Fuori dal try: un PRISMA_* non intero è un errore di configurazione, non un URL da lasciare intatto.
  const { min, max } = INT_ENV.PRISMA_CONNECTION_LIMIT;
  const defaultConnectionLimit = process.env.NODE_ENV === "production" ? 3 : 1;

  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set(
      "connection_limit",
      String(envInt("PRISMA_CONNECTION_LIMIT", defaultConnectionLimit, min, max))
    );
  }

  if (parsed.port === "6543" && !parsed.searchParams.has("pgbouncer")) {
    parsed.searchParams.set("pgbouncer", "true");
  }

  if (!parsed.searchParams.has("pool_timeout")) {
    parsed.searchParams.set("pool_timeout", String(getIntEnv("PRISMA_POOL_TIMEOUT")));
  }

  return parsed.toString();
}

const prismaOptions: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
};

const tunedDatasourceUrl = getTunedDatasourceUrl();

if (tunedDatasourceUrl) {
  prismaOptions.datasources = {
    db: {
      url: tunedDatasourceUrl,
    },
  };
}

export const prisma = global.prisma || new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
