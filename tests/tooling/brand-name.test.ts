// Gate di T-2201 (AC-2201-1): il prodotto si chiama Titan SEO (D-38). Nessun file tracciato contiene il nome precedente
// nelle forme con spazio, trattino o trattino basso; la forma unita resta ammessa, perché è il nome reale del progetto
// Vercel e dei suoi deploy (esterno al repository).
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Il pattern si compone a pezzi: scritto per intero, questo file troverebbe sé stesso.
const PREVIOUS_NAME = ["seo", "god", "mode"].join("[ _-]");

describe("nome del prodotto", () => {
  // covers: AC-2201-1
  it("git grep del nome precedente con separatore non trova righe nei file tracciati", () => {
    const result = spawnSync("git", ["grep", "-n", "-I", "-i", "-E", PREVIOUS_NAME], { encoding: "utf8" });

    expect(result.stdout).toBe("");
    expect(result.status).toBe(1);
  });
});
