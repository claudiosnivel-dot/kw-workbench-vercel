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

    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
    }

    if (parsed.port === "6543" && !parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
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
