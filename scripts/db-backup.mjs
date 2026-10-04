// Backup logico del database (T-604, D-31): pg_dump in formato custom verso <out-dir>/<db>-<timestamp>.dump
// (default backups/, ignorata da git). Sorgente: --url <postgresql://…> con pg_dump e psql locali, oppure
// --container <nome> --db <database> [--user postgres] con pg_dump dentro il container (docker exec).
// Stampa le versioni di pg_dump e del server: pg_dump non esporta da un server di major più recente.
// La password della URL non compare mai in stdout o stderr.
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { majorOf, pgCommand, prepareCommand, runIfMain, runTool } from "./db-tools.mjs";

const DUMP_FLAGS = ["--format=custom", "--no-owner", "--no-privileges"];

export function dumpFileName(database, date) {
  return `${database}-${date.toISOString().replace(/[:.]/g, "-")}.dump`;
}

/** Errore esplicito se il server ha una major più recente di pg_dump (o una delle due è ignota). */
export function checkVersions(clientVersion, serverVersion) {
  const client = majorOf(clientVersion);
  const server = majorOf(serverVersion);
  if (client === null || server === null) {
    return "versione di pg_dump o del server non leggibile";
  }
  if (server > client) {
    return `pg_dump ${client} non può esportare da un server PostgreSQL ${server}: serve un pg_dump di major ${server} o successiva`;
  }
  return null;
}

function versionCommand(target) {
  if (target.container) {
    return { command: "docker", args: ["exec", target.container, "pg_dump", "--version"], env: process.env };
  }
  return { command: "pg_dump", args: ["--version"], env: process.env };
}

export async function runBackup({
  argv,
  run = runTool,
  now = () => new Date(),
  log = (line) => process.stdout.write(`${line}\n`),
  logError = (line) => process.stderr.write(`${line}\n`),
}) {
  const { args, target, fail, error } = prepareCommand("db-backup", argv, [], logError);
  if (!target) {
    return fail(error, 2);
  }

  const client = await run(versionCommand(target));
  if (client.code !== 0) {
    return fail(`pg_dump --version non riuscito: ${client.stderr.trim()}`);
  }
  const server = await run(pgCommand(target, "psql", ["-X", "-tA", "-c", "SHOW server_version"]));
  if (server.code !== 0) {
    return fail(`versione del server non letta: ${server.stderr.trim()}`);
  }
  log(`[db-backup] client: ${client.stdout.trim()}; server: PostgreSQL ${server.stdout.trim()}`);

  const mismatch = checkVersions(client.stdout, server.stdout);
  if (mismatch) {
    return fail(mismatch);
  }

  const outDir = resolve(args["out-dir"] ?? "backups");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, dumpFileName(target.database, now()));
  const dump = await run(pgCommand(target, "pg_dump", DUMP_FLAGS), { output: file });
  if (dump.code !== 0) {
    rmSync(file, { force: true });
    return fail(`pg_dump fallito con exit code ${dump.code}: ${dump.stderr.trim()}`);
  }

  log(`[db-backup] backup scritto in ${file}`);
  return 0;
}

await runIfMain(import.meta.url, (argv) => runBackup({ argv }));
