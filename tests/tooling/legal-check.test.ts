// Gate di T-1803 (AC-1803-2): npm run legal:check blocca il rilascio con testi legali mancanti, segnaposto o con una
// version dei termini diversa da quella del consenso.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";

const COMMAND_TIMEOUT_MS = 120_000;

/** npm run legal:check nella radice del repo, con stdin chiuso; dir facoltativa con i documenti da controllare. */
function legalCheck(dir?: string): SpawnSyncReturns<string> {
  return spawnSync(`npm run -s legal:check${dir ? ` -- --dir ${dir}` : ""}`, {
    shell: true,
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
  });
}

describe("npm run legal:check", () => {
  // covers: AC-1803-2
  it(
    "esce con 0 sulla fixture conforme, con 1 sulla version discordante nominando il file e con 1 sui segnaposto reali",
    () => {
      const conforming = legalCheck("tests/fixtures/legal/conforming");
      expect(conforming.status, conforming.stdout + conforming.stderr).toBe(0);

      const mismatch = legalCheck("tests/fixtures/legal/mismatch");
      expect(mismatch.status).toBe(1);
      expect(mismatch.stderr).toMatch(/mismatch[\\/]it[\\/]terms\.md: version versione-discordante diversa da LEGAL_TERMS_VERSION segnaposto-2026-10-07/);
      expect(mismatch.stderr).toMatch(/mismatch[\\/]en[\\/]terms\.md/);
      expect(mismatch.stderr).not.toMatch(/privacy\.md|cookies\.md/);

      // I file reali restano segnaposto finché D-15 non fornisce i testi: il rilascio commerciale resta bloccato.
      const real = legalCheck();
      expect(real.status).toBe(1);
      expect(real.stderr).toMatch(/content[\\/]legal[\\/]it[\\/]terms\.md: segnaposto/);
    },
    3 * COMMAND_TIMEOUT_MS
  );
});
