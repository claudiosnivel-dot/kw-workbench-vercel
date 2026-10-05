// Gate di T-807 (AC-807-1, AC-807-2): ogni scope di export è l'intersezione tra la regola di revisione
// e la vista corrente (progetto, sezione e filtri), in un unico where.
import { describe, expect, it } from "vitest";
import { buildExportWhere } from "@/lib/modules/export";

function andClauses(where: ReturnType<typeof buildExportWhere>): unknown[] {
  expect(Array.isArray(where.AND)).toBe(true);
  return where.AND as unknown[];
}

describe("buildExportWhere", () => {
  // covers: AC-807-1
  it("non-excluded esclude brand excluded e righe rifiutate, dentro il progetto", () => {
    const clauses = andClauses(buildExportWhere("P", "non-excluded", {}, null));

    expect(clauses).toEqual(
      expect.arrayContaining([
        { project_id: "P" },
        { brand_status: { not: "excluded" } },
        { review_status: { not: "rejected" } },
      ])
    );
  });

  // covers: AC-807-2
  it("approved si combina con sezione e filtri della vista", () => {
    const clauses = andClauses(buildExportWhere("P", "approved", { searchText: "scarpe" }, "S1"));

    expect(clauses).toEqual(
      expect.arrayContaining([
        { project_id: "P" },
        { subproject_id: "S1" },
        { review_status: "approved" },
        { brand_status: { not: "excluded" } },
        {
          OR: [
            { keyword: { contains: "scarpe", mode: "insensitive" } },
            { normalized_keyword: { contains: "scarpe", mode: "insensitive" } },
          ],
        },
      ])
    );
  });
});
