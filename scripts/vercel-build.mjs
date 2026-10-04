// Build Vercel con guardia sulle migrazioni (T-202, D-04): un deploy Preview, che esegue codice di
// branch non revisionato, non applica migrazioni né seed al DB di produzione. Nel dubbio salta.
// Solo moduli built-in. Nei log compaiono al più hostname e username del DB.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Major di Node di produzione (T-407): la stessa di .nvmrc, engines.node e CI.
const REQUIRED_NODE_MAJOR = 24;

const MIGRATE = ["prisma", "migrate", "deploy"];
const SEED = ["prisma", "db", "seed"];
const BUILD = ["next", "build"];

/** Identità di un DB da URL di connessione: hostname e username, senza password né parametri. */
export function dbIdentity(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) {
      return null;
    }
    return {
      hostname: parsed.hostname.toLowerCase(),
      username: decodeURIComponent(parsed.username).toLowerCase() || null,
    };
  } catch {
    return null;
  }
}

/**
 * Il pooler Supabase ha un host regionale condiviso tra progetti e il progetto sta nello username
 * (postgres.<project-ref>): se il riferimento ha uno username si confrontano entrambi.
 */
export function sameDatabase(target, reference) {
  if (target.hostname !== reference.hostname) {
    return false;
  }
  return reference.username === null || target.username === reference.username;
}

function parseProductionDbHost(value) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const at = trimmed.lastIndexOf("@");
  return at >= 0
    ? { username: trimmed.slice(0, at).toLowerCase(), hostname: trimmed.slice(at + 1).toLowerCase() }
    : { username: null, hostname: trimmed.toLowerCase() };
}

function describeDb(identity) {
  return identity.username ? `host ${identity.hostname}, utente ${identity.username}` : `host ${identity.hostname}`;
}

/** Lancia se la major di version (es. v24.3.0) è diversa da expected. */
export function assertNodeMajor(version, expected) {
  const major = Number(/^v?(\d+)\./.exec(version ?? "")?.[1]);
  if (major !== expected) {
    throw new Error(`[vercel-build] il build richiede Node ${expected}: il runtime è ${version}`);
  }
}

export function decideMigration({ VERCEL_ENV, DIRECT_URL, PRODUCTION_DB_HOST }) {
  if (VERCEL_ENV === "production") {
    return { migrate: true, reason: "deploy Production" };
  }
  if (VERCEL_ENV !== "preview") {
    return { migrate: false, reason: `VERCEL_ENV ${VERCEL_ENV || "assente"}: si migra solo nei deploy production e preview` };
  }

  const reference = parseProductionDbHost(PRODUCTION_DB_HOST);
  if (!reference) {
    return { migrate: false, reason: "PRODUCTION_DB_HOST non impostata: non si può escludere il DB di produzione" };
  }

  const target = dbIdentity(DIRECT_URL);
  if (!target) {
    return { migrate: false, reason: "DIRECT_URL assente o non valida" };
  }

  if (sameDatabase(target, reference)) {
    return { migrate: false, reason: `DIRECT_URL punta al DB di produzione (${describeDb(target)})` };
  }
  return { migrate: true, reason: `DB di Preview distinto da quello di produzione (${describeDb(target)})` };
}

export async function runVercelBuild({
  env,
  run,
  log = (line) => process.stdout.write(`${line}\n`),
  logError = (line) => process.stderr.write(`${line}\n`),
}) {
  const decision = decideMigration(env);
  log(`[vercel-build] migrazioni ${decision.migrate ? "applicate" : "saltate"}: ${decision.reason}`);

  for (const argv of decision.migrate ? [MIGRATE, SEED, BUILD] : [BUILD]) {
    const code = await run(argv);
    if (code !== 0) {
      logError(`[vercel-build] ${argv.join(" ")} fallito con exit code ${code}`);
      return code;
    }
  }
  return 0;
}

function runCommand(argv) {
  // Lanciato da npm run vercel-build: node_modules/.bin è nel PATH.
  const result = spawnSync(argv[0], argv.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    process.stderr.write(`[vercel-build] ${argv[0]} non avviato: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(`[vercel-build] Node ${process.version}\n`);
  // Su Vercel una major diversa da quella testata in CI ferma il build prima di migrazioni e next build.
  if (process.env.VERCEL === "1") {
    try {
      assertNodeMajor(process.version, REQUIRED_NODE_MAJOR);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
  }
  process.exitCode = await runVercelBuild({ env: process.env, run: runCommand });
}
