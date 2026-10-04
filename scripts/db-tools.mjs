// Strumenti comuni a db-backup.mjs e db-restore.mjs (T-604). Solo moduli built-in. Le password delle URL
// non finiscono mai negli argomenti dei processi né nei log: viaggiano in PGPASSWORD.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Argomenti `--nome valore` (o `--nome=valore`); i nomi in `flags` sono booleani senza valore. */
export function parseArgs(argv, flags = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[index]);
    if (!match) {
      continue;
    }
    const [, name, inline] = match;
    args[name] = flags.includes(name) ? true : (inline ?? argv[(index += 1)]);
  }
  return args;
}

/** URL di connessione senza password (la password va in PGPASSWORD), con host e database per i messaggi. */
export function splitUrl(url) {
  const parsed = new URL(url);
  const password = decodeURIComponent(parsed.password);
  parsed.password = "";
  return { url: parsed.toString(), password, hostname: parsed.hostname, database: parsed.pathname.replace(/^\//, "") };
}

/**
 * Comando da eseguire per la sorgente o destinazione scelta: con --container dentro il container via
 * docker exec (-i se serve lo stdin), con --url in locale con la connessione in --dbname.
 */
export function pgCommand(target, tool, toolArgs, { stdin = false } = {}) {
  if (target.container) {
    const exec = ["exec", ...(stdin ? ["-i"] : []), target.container, tool, "-U", target.user, "-d", target.database];
    return { command: "docker", args: [...exec, ...toolArgs], env: process.env };
  }
  return {
    command: tool,
    args: [`--dbname=${target.url}`, ...toolArgs],
    env: { ...process.env, PGPASSWORD: target.password },
  };
}

/** Toglie i segreti da un testo destinato a stdout o stderr. */
export function redact(text, secrets) {
  return secrets.filter(Boolean).reduce((result, secret) => result.split(secret).join("***"), text);
}

/** Major di PostgreSQL da «pg_dump (PostgreSQL) 16.4 (Debian …)» o da «16.4». */
export function majorOf(versionText) {
  const match = /(\d+)(?:\.\d+)?/.exec(versionText ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Esegue un comando senza shell. `input`: file passato sullo stdin; `output`: file che riceve lo stdout
 * (binario), altrimenti lo stdout torna come testo. Un comando non avviabile dà code 127.
 */
export function runTool({ command, args, env }, { input, output } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    // Con un file di output si risponde solo dopo che il file è stato scritto per intero.
    const written = output
      ? new Promise((done) => child.stdout.pipe(createWriteStream(output)).on("close", done))
      : Promise.resolve();

    if (!output) {
      child.stdout.on("data", (chunk) => stdout.push(chunk));
    }
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    if (input) {
      createReadStream(input).pipe(child.stdin);
    } else {
      child.stdin.end();
    }

    child.on("error", (error) => {
      resolve({ code: 127, stdout: "", stderr: `${command} non avviato (${error.code ?? "errore"})` });
    });
    child.on("close", async (code) => {
      await written;
      resolve({ code: code ?? 1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

/** Sorgente o destinazione da --url oppure da --container (con --db e --user). */
export function resolveTarget(args) {
  if (args.url && args.container) {
    throw new Error("indica --url oppure --container, non entrambi");
  }
  if (args.url) {
    return { ...splitUrl(args.url), container: null };
  }
  if (args.container) {
    if (!args.db) {
      throw new Error("con --container serve --db <database>");
    }
    return { container: args.container, database: args.db, user: args.user ?? "postgres", password: "", hostname: null };
  }
  throw new Error("indica --url <postgresql://…> oppure --container <nome> --db <database>");
}

/**
 * Argomenti, sorgente o destinazione e `fail`, che scrive su stderr il messaggio senza la password con il
 * prefisso del comando e restituisce l'exit code. Con argomenti insufficienti `target` è null e `error` dice perché.
 */
export function prepareCommand(prefix, argv, flags, logError) {
  const args = parseArgs(argv, flags);
  let secrets = [];
  const fail = (message, code = 1) => {
    logError(`[${prefix}] ${redact(message, secrets)}`);
    return code;
  };

  try {
    const target = resolveTarget(args);
    secrets = [target.password, args.url && encodeURIComponent(target.password)];
    return { args, target, fail, error: null };
  } catch (error) {
    return { args, target: null, fail, error: error instanceof Error ? error.message : "URL non valida" };
  }
}

/** Esegue `main` con gli argomenti della riga di comando quando il modulo è lo script lanciato da node. */
export async function runIfMain(moduleUrl, main) {
  if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === moduleUrl) {
    process.exitCode = await main(process.argv.slice(2));
  }
}
