import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { assertLocalTestDatabase } from "./db-guard";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

// Tabella di storico che prisma migrate deploy crea prima della prima migrazione: la 0012 vi abilita la RLS.
const PRISMA_MIGRATIONS_TABLE = `CREATE TABLE "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/** Cartelle di prisma/migrations con un migration.sql, nell'ordine di applicazione di Prisma (ordine lessicografico). */
function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(MIGRATIONS_DIR, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

export type TemporaryDatabase = {
  /** Client collegato al database temporaneo: inserimenti dei dati legacy e verifiche. */
  client: Client;
  /** Messaggi di RAISE NOTICE ricevuti dal client, in ordine. */
  notices: string[];
  /** Applica in ordine le migrazioni precedenti a quella indicata (esclusa). */
  migrateBefore(name: string): Promise<void>;
  /** Applica una sola migrazione, con lo stesso SQL che esegue prisma migrate deploy. */
  apply(name: string): Promise<void>;
  /** Chiude il client e cancella il database. */
  drop(): Promise<void>;
};

/**
 * Database vuoto e temporaneo sul Postgres di test (T-1501): serve a provare una migrazione su dati allo schema
 * precedente senza toccare il DB condiviso degli altri test. Solo su host locale, come gli altri helper del DB.
 */
export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const baseUrl = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
  const name = `kw_migration_test_${randomBytes(6).toString("hex")}`;

  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const notices: string[] = [];
  client.on("notice", (notice) => notices.push(notice.message ?? ""));
  await client.query(PRISMA_MIGRATIONS_TABLE);

  const apply = async (migration: string) => {
    await client.query(readFileSync(path.join(MIGRATIONS_DIR, migration, "migration.sql"), "utf8"));
  };

  return {
    client,
    notices,
    apply,
    async migrateBefore(migration) {
      const names = migrationNames();
      const index = names.indexOf(migration);
      if (index < 0) {
        throw new Error(`Migrazione ${migration} non trovata in prisma/migrations`);
      }
      for (const previous of names.slice(0, index)) {
        await apply(previous);
      }
    },
    async drop() {
      await client.end();
      const cleanup = new Client({ connectionString: baseUrl });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
