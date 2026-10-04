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
    expect(Object.keys(graph)).toContain("components/onboarding-seeds-form.tsx");
    expect(findForbiddenPaths(graph, [{ from: "components/**", to: "lib/prisma.ts" }])).toEqual([]);
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
  it("i tipi di onboarding vivono in lib/onboarding/types.ts e i componenti li importano da lì", () => {
    const types = source("lib/onboarding/types.ts");
    expect(types).not.toContain("lib/prisma");
    expect(types.match(/^import\s+(?!type\s)/gm)).toBeNull();

    for (const component of ["components/onboarding-project-targeting-form.tsx", "components/onboarding-seeds-form.tsx"]) {
      const text = source(component);
      expect(text).toContain('from "@/lib/onboarding/types"');
      expect(text).not.toContain('from "@/lib/onboarding/progress"');
    }
  });
});
