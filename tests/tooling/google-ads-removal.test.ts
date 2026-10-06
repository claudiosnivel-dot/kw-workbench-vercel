// Gate di T-901 (AC-901-3): nessun residuo dell'integrazione Google Ads nel sorgente, nello schema e nell'esempio
// delle variabili d'ambiente.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const SCOPE = ["app", "components", "lib", "prisma/schema.prisma", ".env.example"];
const PATTERNS = ["GOOGLE_ADS_", "GoogleAds", "google-ads", "GOOGLE_KEYWORD_PLANNER", "googleAdsCredential"];

describe("rimozione dell'integrazione Google Ads", () => {
  // covers: AC-901-3
  it.each(PATTERNS)("git grep di %s non trova righe", (pattern) => {
    const result = spawnSync("git", ["grep", "-n", "--fixed-strings", pattern, "--", ...SCOPE], { encoding: "utf8" });

    expect(result.stdout).toBe("");
    expect(result.status).toBe(1);
  });
});
