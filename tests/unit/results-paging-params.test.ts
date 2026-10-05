// Gate di T-801 (AC-801-1, AC-801-2): parametri di paginazione dei risultati letti in un solo punto,
// con default e limiti condivisi da pagina e API, e link ricostruiti senza toccare gli altri parametri.
import { describe, expect, it } from "vitest";
import { parsePagingParams, withPaging } from "@/lib/modules/results-paging";

describe("parsePagingParams", () => {
  // covers: AC-801-1
  it("riporta page e pageSize non validi ai default e limita pageSize al range 20-250", () => {
    const pages = ["", "abc", "0", "-3", "2.7", "3"].map(
      (page) => parsePagingParams(new URLSearchParams({ page })).page
    );
    const pageSizes = ["", "abc", "10", "150", "1000"].map(
      (pageSize) => parsePagingParams({ pageSize }).pageSize
    );

    expect(pages).toEqual([1, 1, 1, 1, 2, 3]);
    expect(pageSizes).toEqual([100, 100, 20, 150, 250]);
  });
});

describe("withPaging", () => {
  // covers: AC-801-2
  it("sostituisce page senza duplicarlo, conserva gli altri parametri e non modifica l'originale", () => {
    const source = new URLSearchParams("searchText=scarpe&page=3&pageSize=50&view=all");

    const serialized = withPaging(source, { page: 1 }).toString();

    expect(serialized.match(/(^|&)page=/g)).toHaveLength(1);
    expect(serialized).toContain("page=1");
    expect(serialized).toContain("pageSize=50");
    expect(serialized).toContain("searchText=scarpe");
    expect(serialized).toContain("view=all");
    expect(source.get("page")).toBe("3");
  });
});
