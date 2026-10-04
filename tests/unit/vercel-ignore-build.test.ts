// Gate di T-605 (AC-605-1…AC-605-4): l'Ignored Build Step salta solo i commit di sola documentazione.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runIgnoreBuild } from "../../scripts/vercel-ignore-build.mjs";

const SHAS = { VERCEL_GIT_PREVIOUS_SHA: "a1b2c3d", VERCEL_GIT_COMMIT_SHA: "e4f5a6b" };

/** Esegue lo script con un git diff simulato: un elenco di file oppure un errore. */
function ignoreBuild(env: Record<string, string | undefined>, changed: string[] | Error) {
  const lines: string[] = [];
  const code = runIgnoreBuild({
    env,
    diff: () => {
      if (changed instanceof Error) {
        throw changed;
      }
      return changed;
    },
    log: (line: string) => lines.push(line),
  });
  return { code, output: lines.join("\n") };
}

describe("commit di sola documentazione", () => {
  // covers: AC-605-1
  it("esce con codice 0 e dice che il commit tocca solo documentazione", () => {
    const result = ignoreBuild(SHAS, ["docs/blueprint/04-stack-upgrade.md", "docs/RELEASE.md"]);

    expect(result.code).toBe(0);
    expect(result.output).toContain("solo documentazione");
  });
});

describe("commit con codice o dipendenze", () => {
  // covers: AC-605-2
  it("esce con codice 1 se oltre a docs/ cambia app/page.tsx o se cambia solo package-lock.json", () => {
    expect(ignoreBuild(SHAS, ["docs/README.md", "app/page.tsx"]).code).toBe(1);
    expect(ignoreBuild(SHAS, ["package-lock.json"]).code).toBe(1);
  });
});

describe("casi incerti", () => {
  // covers: AC-605-3
  it("esce con codice 1 con lo SHA precedente vuoto o con git diff in errore", () => {
    expect(ignoreBuild({ ...SHAS, VERCEL_GIT_PREVIOUS_SHA: "" }, ["docs/RELEASE.md"]).code).toBe(1);
    expect(ignoreBuild(SHAS, new Error("fatal: bad object a1b2c3d")).code).toBe(1);
  });
});

describe("vercel.json", () => {
  // covers: AC-605-4
  it("ha l'ignoreCommand dello script e il buildCommand di T-202", () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      ignoreCommand?: string;
      buildCommand?: string;
    };

    expect(config.ignoreCommand).toBe("node scripts/vercel-ignore-build.mjs");
    expect(config.buildCommand).toBe("npm run vercel-build");
  });
});
