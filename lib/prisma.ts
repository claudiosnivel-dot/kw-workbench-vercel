import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function getTunedDatasourceUrl(): string | undefined {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(rawUrl);
    const isSupabasePooler = parsed.hostname.endsWith(".pooler.supabase.com");

    if (!isSupabasePooler) {
      return rawUrl;
    }

    const defaultConnectionLimit =
      process.env.NODE_ENV === "production" ? "3" : "1";

    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set(
        "connection_limit",
        process.env.PRISMA_CONNECTION_LIMIT ?? defaultConnectionLimit
      );
    }

    if (parsed.port === "6543" && !parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
    }

    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT ?? "15");
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
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
