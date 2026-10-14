// Gate di T-2702 (AC-2702-1): il pulsante RunExtractionButton, rimasto senza pagine, non esiste più nel sorgente.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCOPE = ["app", "components", "lib"];
const PATTERNS = ["RunExtractionButton", "run-extraction-button"];

describe("rimozione di RunExtractionButton", () => {
  // covers: AC-2702-1
  it.each(PATTERNS)("git grep di %s non trova righe", (pattern) => {
    const result = spawnSync("git", ["grep", "-n", "--fixed-strings", pattern, "--", ...SCOPE], { encoding: "utf8" });

    expect(result.stdout).toBe("");
    expect(result.status).toBe(1);
  });

  // covers: AC-2702-1
  it("il file components/run-extraction-button.tsx non esiste", () => {
    expect(existsSync("components/run-extraction-button.tsx")).toBe(false);
  });
});
