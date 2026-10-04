// Ignored Build Step di Vercel (T-605), da ignoreCommand in vercel.json: exit 0 annulla la build (stato
// CANCELED), exit 1 la fa proseguire. Si salta solo un commit che, rispetto all'ultimo deploy riuscito del
// branch, tocca esclusivamente file sotto docs/; nel dubbio (SHA mancante, git diff in errore) si builda.
// Solo moduli built-in; nessun segreto letto né variabile d'ambiente stampata.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Vero solo se c'è almeno un file e tutti stanno sotto docs/. */
export function shouldSkipBuild(files) {
  return files.length > 0 && files.every((file) => file.startsWith("docs/"));
}

export function runIgnoreBuild({ env, diff, log = (line) => process.stdout.write(`${line}\n`) }) {
  const previous = (env.VERCEL_GIT_PREVIOUS_SHA ?? "").trim();
  const current = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim();
  if (!previous || !current) {
    log("[ignore-build] SHA del deploy precedente o del commit assente: build normale");
    return 1;
  }

  let files;
  try {
    files = diff(previous, current);
  } catch {
    log("[ignore-build] git diff non riuscito: build normale");
    return 1;
  }

  if (shouldSkipBuild(files)) {
    log(`[ignore-build] il commit tocca solo documentazione (${files.length} file sotto docs/): build annullata`);
    return 0;
  }
  log(`[ignore-build] ${files.length} file cambiati, non solo documentazione: build normale`);
  return 1;
}

function gitDiff(previous, current) {
  const result = spawnSync("git", ["diff", "--name-only", previous, current], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("git diff non riuscito");
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runIgnoreBuild({ env: process.env, diff: gitDiff });
}
