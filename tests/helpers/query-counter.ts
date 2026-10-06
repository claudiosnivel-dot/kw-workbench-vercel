import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

export type QueryKind = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

/** Statement registrato: SQL con i segnaposto $n e i parametri in JSON, come li dà l'evento query. */
export type RecordedStatement = { query: string; params: string };

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
 * del modulo originale; count(tabella, tipo) conta gli statement registrati dopo l'ultimo reset() e
 * statements(tabella, tipo) li restituisce con i parametri (T-1103).
 */
export function createQueryCounter(poolConfig: PoolConfig) {
  const client = new PrismaClient({
    adapter: new PrismaPg(poolConfig),
    log: [{ emit: "event", level: "query" }],
  });
  const recorded: RecordedStatement[] = [];
  client.$on("query", (event) => {
    recorded.push({ query: event.query, params: event.params });
  });
  const matching = (table: string, kind: QueryKind) =>
    recorded.filter((statement) => {
      const query = classify(statement.query);
      return query?.table === table && query.kind === kind;
    });

  return {
    client,
    reset(): void {
      recorded.length = 0;
    },
    count(table: string, kind: QueryKind): number {
      return matching(table, kind).length;
    },
    statements(table: string, kind: QueryKind): RecordedStatement[] {
      return matching(table, kind);
    },
  };
}

export type QueryCounter = ReturnType<typeof createQueryCounter>;
