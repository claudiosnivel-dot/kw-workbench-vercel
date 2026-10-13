// Gate di T-807 (AC-807-1, AC-807-2): il where di export è unico e parte sempre dal progetto, con la sezione già
// verificata dalla route.
// impacted-by: T-2402 (D-23 emendata: scope kept, all e filtered; kept e all non usano i filtri della vista, filtered li
// usa tutti; AC-807-1 e AC-807-2 emendati)
import { describe, expect, it } from "vitest";
import { buildExportWhere } from "@/lib/modules/export";

function andClauses(where: ReturnType<typeof buildExportWhere>): unknown[] {
  expect(Array.isArray(where.AND)).toBe(true);
  return where.AND as unknown[];
}

const SEARCH_SCARPE = {
  OR: [
    { keyword: { contains: "scarpe", mode: "insensitive" } },
    { normalized_keyword: { contains: "scarpe", mode: "insensitive" } },
  ],
};

describe("buildExportWhere", () => {
  // covers: AC-807-1
  it("kept tiene le keyword non scartate del progetto, senza clausole sul marchio", () => {
    const clauses = andClauses(buildExportWhere("P", "kept", {}, null));

    expect(clauses).toEqual([{ project_id: "P" }, { review_status: { not: "rejected" } }]);
  });

  // covers: AC-807-2
  it("kept con sezione e ricerca ignora i filtri della vista; filtered li applica tutti", () => {
    const kept = andClauses(buildExportWhere("P", "kept", { searchText: "scarpe" }, "S1"));
    const filtered = andClauses(buildExportWhere("P", "filtered", { searchText: "scarpe" }, "S1"));

    expect(kept).toEqual([{ project_id: "P" }, { subproject_id: "S1" }, { review_status: { not: "rejected" } }]);
    expect(filtered).toEqual([{ project_id: "P" }, { subproject_id: "S1" }, SEARCH_SCARPE]);
  });
});
