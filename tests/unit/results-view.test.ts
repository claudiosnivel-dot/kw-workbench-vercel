// Gate di T-802 (AC-802-1…4): la vista dei risultati (sezione o progetto) si risolve in un solo modulo,
// con la sezione predefinita reale (D-21); l'export porta la sezione mostrata e i link verso i risultati
// dichiarano sempre la vista.
// impacted-by: T-2402 (scope kept al posto di approved in AC-802-3), T-2403 (i link portano alla pagina delle keyword, con
// la vista nel percorso: AC-802-4 emendato)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildResultsExportHref, keywordsHref, resolveResultsView } from "@/lib/modules/results-view";

const SECTIONS = [
  { id: "S1", position: 0 },
  { id: "S2", position: 1 },
];

function resolve(defaultSubprojectId: string | null, query: string) {
  return resolveResultsView({ subprojects: SECTIONS, defaultSubprojectId, searchParams: new URLSearchParams(query) });
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

describe("resolveResultsView", () => {
  // covers: AC-802-1
  it("senza parametri usa la sezione predefinita se appartiene al progetto, altrimenti la prima per posizione", () => {
    expect(resolve("S2", "")).toEqual({ kind: "section", subprojectId: "S2" });
    expect(resolve("altro-progetto", "")).toEqual({ kind: "section", subprojectId: "S1" });
    expect(resolve(null, "")).toEqual({ kind: "section", subprojectId: "S1" });
  });

  // covers: AC-802-2
  it("view=all prevale, poi la sezione richiesta; una sezione estranea è not-found", () => {
    expect([
      resolve("S2", "view=all"),
      resolve("S2", "subprojectId=S1"),
      resolve("S2", "subprojectId=altro-id"),
      resolve("S2", "view=all&subprojectId=S1"),
    ]).toEqual([
      { kind: "all" },
      { kind: "section", subprojectId: "S1" },
      { kind: "not-found" },
      { kind: "all" },
    ]);
  });
});

describe("buildResultsExportHref", () => {
  // covers: AC-802-3
  it("porta la sezione della vista risolta e i filtri, mai page e pageSize", () => {
    const searchParams = new URLSearchParams("searchText=scarpe&page=3&pageSize=50");

    const sectionHref = new URL(
      buildResultsExportHref("P", { kind: "section", subprojectId: "S2" }, searchParams, "csv", "kept"),
      "http://localhost"
    );
    const allHref = buildResultsExportHref("P", { kind: "all" }, searchParams, "csv", "kept");

    expect(sectionHref.pathname).toBe("/api/projects/P/export");
    expect(sectionHref.searchParams.get("subprojectId")).toBe("S2");
    expect(sectionHref.searchParams.get("searchText")).toBe("scarpe");
    expect(sectionHref.searchParams.get("format")).toBe("csv");
    expect(sectionHref.searchParams.get("scope")).toBe("kept");
    expect(sectionHref.searchParams.has("page")).toBe(false);
    expect(sectionHref.searchParams.has("pageSize")).toBe(false);
    expect(allHref).not.toContain("subprojectId");
  });
});

describe("link verso la pagina delle keyword", () => {
  // covers: AC-802-4
  it("keywordsHref mette la vista nel percorso e nessun sorgente di app/ ha più href verso /results", () => {
    const appDir = path.join(process.cwd(), "app");
    const offending = tsxFiles(appDir).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return Array.from(source.matchAll(/\/projects\/[^"'`\s]*\/results[^"'`\s]*/g)).map(
        ([match]) => `${path.relative(appDir, file)}: ${match}`
      );
    });

    expect(keywordsHref("P", { view: "all" })).toBe("/projects/P/keywords");
    expect(keywordsHref("P", { subprojectId: "S1" }, new URLSearchParams("view=all&chip=questions"))).toBe(
      "/projects/P/keywords/S1?chip=questions"
    );
    expect(offending).toEqual([]);
  });
});
