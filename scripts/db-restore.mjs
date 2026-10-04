// Ripristino di un backup di db-backup.mjs (T-604): pg_restore --clean --if-exists --no-owner verso un database
// indicato in modo esplicito, con --url <postgresql://…> (pg_restore locale) oppure --container <nome> --db
// <database> [--user postgres]. Una destinazione con l'host di PRODUCTION_DB_HOST (T-202) si rifiuta con exit
// code 2 senza --confirm-production. La password della URL non compare mai in stdout o stderr.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, pgCommand, redact, resolveTarget, runTool } from "./db-tools.mjs";
import { dbIdentity, parseProductionDbHost, sameDatabase } from "./vercel-build.mjs";

const RESTORE_FLAGS = ["--clean", "--if-exists", "--no-owner"];

/** Vero se la destinazione --url è il DB di produzione indicato da PRODUCTION_DB_HOST. */
export function isProductionTarget(url, productionDbHost) {
  const reference = parseProductionDbHost(productionDbHost);
  const target = dbIdentity(url);
  return Boolean(reference && target && sameDatabase(target, reference));
}

export async function runRestore({
  argv,
  env = process.env,
  run = runTool,
  log = (line) => process.stdout.write(`${line}\n`),
  logError = (line) => process.stderr.write(`${line}\n`),
}) {
  const args = parseArgs(argv, ["confirm-production"]);
  let secrets = [];
  const fail = (message, code = 1) => {
    logError(`[db-restore] ${redact(message, secrets)}`);
    return code;
  };

  let target;
  try {
    target = resolveTarget(args);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "URL non valida", 2);
  }
  secrets = [target.password, args.url && encodeURIComponent(target.password)];

  if (args.url && isProductionTarget(args.url, env.PRODUCTION_DB_HOST) && !args["confirm-production"]) {
    return fail(
      `la destinazione (host ${target.hostname}) coincide con PRODUCTION_DB_HOST: ripristino rifiutato; per sovrascrivere davvero la produzione aggiungi --confirm-production`,
      2
    );
  }

  if (!args.file || !existsSync(args.file)) {
    return fail("indica con --file un backup esistente", 2);
  }

  log(`[db-restore] ripristino di ${args.file} nel database ${target.database}`);
  const restore = await run(pgCommand(target, "pg_restore", RESTORE_FLAGS, { stdin: true }), { input: args.file });
  if (restore.code !== 0) {
    return fail(`pg_restore fallito con exit code ${restore.code}: ${restore.stderr.trim()}`);
  }

  log("[db-restore] ripristino completato");
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runRestore({ argv: process.argv.slice(2) });
}
