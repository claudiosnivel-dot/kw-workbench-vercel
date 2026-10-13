import { readFileSync } from "node:fs";
import { join } from "node:path";
import madge from "madge";
import { beforeAll, describe, expect, it } from "vitest";
import { findForbiddenPaths, type DependencyGraph } from "./forbidden-paths";

const ROOT = process.cwd();

function source(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("contratto di altitudine D-22", () => {
  let graph: DependencyGraph;

  beforeAll(async () => {
    const result = await madge(["app", "components", "lib"], {
      baseDir: ROOT,
      tsConfig: join(ROOT, "tsconfig.json"),
      fileExtensions: ["ts", "tsx"],
      // Anche gli import di soli tipi contano.
      detectiveOptions: { ts: { skipTypeImports: false }, tsx: { skipTypeImports: false } },
    });
    graph = result.obj();
  }, 120_000);

  // covers: AC-109-1
  it("nessun componente raggiunge lib/prisma.ts", () => {
    // impacted-by: T-2306 (componenti dell'onboarding rimossi): il grafo contiene la barra laterale del progetto.
    expect(Object.keys(graph)).toContain("components/project-sidebar.tsx");
    // T-403: neppure il client generato da Prisma 7 (ai componenti arrivano solo i tipi degli enum).
    expect(
      findForbiddenPaths(graph, [
        { from: "components/**", to: "lib/prisma.ts" },
        { from: "components/**", to: "lib/generated/prisma/client.ts" },
      ])
    ).toEqual([]);
  });

  // covers: AC-109-2
  it("nessun modulo di dominio raggiunge componenti o rotte", () => {
    expect(
      findForbiddenPaths(graph, [
        { from: "lib/modules/**", to: "components/**" },
        { from: "lib/modules/**", to: "app/**" },
      ])
    ).toEqual([]);
  });

  // covers: AC-109-3
  it("un cammino transitivo verso lib/prisma.ts è restituito per intero", () => {
    const synthetic: DependencyGraph = {
      "components/x.tsx": ["lib/y.ts"],
      "lib/y.ts": ["lib/prisma.ts"],
      "lib/prisma.ts": [],
    };

    expect(findForbiddenPaths(synthetic, [{ from: "components/**", to: "lib/prisma.ts" }])).toEqual([
      ["components/x.tsx", "lib/y.ts", "lib/prisma.ts"],
    ]);
  });

  // covers: AC-109-4
  // impacted-by: T-2306 (onboarding rimosso, AC-109-4 emendato): i tipi del percorso vivono in lib/modules/next-step.ts,
  // modulo puro, e i componenti li importano da lì, mai da lib/modules/project-progress.ts che legge il DB.
  it("i tipi del prossimo passo vivono in lib/modules/next-step.ts e i componenti li importano da lì", () => {
    const types = source("lib/modules/next-step.ts");
    expect(types).not.toContain("lib/prisma");
    expect(types.match(/^import\s+(?!type\s)/gm)).toBeNull();

    for (const component of ["components/next-step-bar.tsx", "components/project-sidebar.tsx"]) {
      const text = source(component);
      expect(text).toContain('from "@/lib/modules/next-step"');
      expect(text).not.toContain('from "@/lib/modules/project-progress"');
    }
  });
});
