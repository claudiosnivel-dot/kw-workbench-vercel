// Verifica degli ambienti (T-203, D-04): confronta i DB configurati per Production, Preview e
// Development nei file scritti da `vercel env pull --environment=<env>` e segnala in modo esplicito
// una Preview che usa il DB di produzione. Solo moduli built-in; password sempre oscurate.
import { existsSync, readFileSync } from "node:fs";
import { dbIdentity, sameDatabase } from "./vercel-build.mjs";

const ENVIRONMENTS = [
  { name: "production", label: "Production", file: ".env.production.local", required: true },
  { name: "preview", label: "Preview", file: ".env.preview.local", required: true },
  { name: "development", label: "Development", file: ".env.development.local", required: false },
];
const URL_KEYS = ["DATABASE_URL", "DIRECT_URL"];

function parseArgs(argv) {
  const paths = {};
  for (let index = 0; index < argv.length; index += 1) {
    const match = /^--(production|preview|development)(?:=(.*))?$/.exec(argv[index]);
    if (match) {
      paths[match[1]] = match[2] ?? argv[(index += 1)];
    }
  }
  return paths;
}

/** Parser minimo del formato KEY=VALUE (con virgolette opzionali) scritto da vercel env pull. */
function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return values;
}

function describeUrl(url) {
  try {
    const parsed = new URL(url);
    const user = decodeURIComponent(parsed.username);
    const credentials = user ? `${user}${parsed.password ? ":***" : ""}@` : "";
    const port = parsed.port || "5432";
    const database = parsed.pathname.replace(/^\//, "");
    return `${parsed.protocol}//${credentials}${parsed.hostname}:${port}/${database} (host ${parsed.hostname}, porta ${port}, database ${database}, utente ${user || "-"})`;
  } catch {
    return "URL non valida";
  }
}

function main() {
  const paths = parseArgs(process.argv.slice(2));
  const loaded = {};
  let exitCode = 0;

  for (const environment of ENVIRONMENTS) {
    const path = paths[environment.name] ?? environment.file;
    const pull = `vercel env pull --environment=${environment.name} ${path}`;

    if (!existsSync(path)) {
      console.log(`[env-check] ${environment.label}: file ${path} assente${environment.required ? "" : " (facoltativo)"}; esegui: ${pull}`);
      if (environment.required) {
        exitCode = 1;
      }
      continue;
    }

    loaded[environment.name] = readEnvFile(path);
    console.log(`[env-check] ${environment.label} (${path})`);
    for (const key of URL_KEYS) {
      const url = loaded[environment.name][key];
      console.log(`  ${key}: ${url ? describeUrl(url) : "non impostata"}`);
    }
  }

  if (loaded.production && loaded.preview) {
    const shared = URL_KEYS.filter((key) => {
      const production = dbIdentity(loaded.production[key]);
      const preview = dbIdentity(loaded.preview[key]);
      return production && preview && sameDatabase(preview, production);
    });

    if (shared.length > 0) {
      console.log(`[env-check] PREVIEW USA IL DB DI PRODUZIONE (${shared.join(", ")})`);
      exitCode = 1;
    } else {
      console.log("[env-check] Preview e Production usano DB distinti");
    }
  }

  return exitCode;
}

process.exitCode = main();
