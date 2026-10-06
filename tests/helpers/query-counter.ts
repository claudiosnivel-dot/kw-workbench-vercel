import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

export type QueryKind = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

// Tabella su cui opera lo statement: dopo FROM (SELECT, DELETE), INTO (INSERT) o UPDATE.
const TARGET_TABLE: Record<QueryKind, RegExp> = {
  SELECT: /\bFROM\s+(?:"\w+"\.)?"(\w+)"/i,
  INSERT: /^INSERT\s+INTO\s+(?:"\w+"\.)?"(\w+)"/i,
  UPDATE: /^UPDATE\s+(?:"\w+"\.)?"(\w+)"/i,
  DELETE: /^DELETE\s+FROM\s+(?:"\w+"\.)?"(\w+)"/i,
};

function classify(sql: string): { kind: QueryKind; table: string } | null {
  const statement = sql.trim();
  const kind = (["SELECT", "INSERT", "UPDATE", "DELETE"] as const).find((candidate) =>
    statement.toUpperCase().startsWith(candidate)
  );
  const table = kind ? TARGET_TABLE[kind].exec(statement)?.[1] : undefined;
  return kind && table ? { kind, table } : null;
}

/**
 * Client Prisma che registra gli statement SQL tramite l'evento query di Prisma (T-1004, riusabile da T-1105).
 * Si installa al posto del client dell'app con vi.mock("@/lib/prisma"), passando la configurazione del pool
 * del modulo originale; count(tabella, tipo) conta gli statement registrati dopo l'ultimo reset().
 */
export function createQueryCounter(poolConfig: PoolConfig) {
  const client = new PrismaClient({
    adapter: new PrismaPg(poolConfig),
    log: [{ emit: "event", level: "query" }],
  });
  const statements: string[] = [];
  client.$on("query", (event) => {
    statements.push(event.query);
  });

  return {
    client,
    reset(): void {
      statements.length = 0;
    },
    count(table: string, kind: QueryKind): number {
      return statements.map(classify).filter((query) => query?.table === table && query.kind === kind).length;
    },
  };
}

export type QueryCounter = ReturnType<typeof createQueryCounter>;
