// Gate di T-905 (AC-905-1, AC-905-2): parser del file di Keyword Planner su fixture sintetiche con la struttura
// del DoD (UTF-16LE con tabulazioni e righe di titolo, colonne IT, volumi a range).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlannerCsv } from "@/lib/modules/planner/csv-parser";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`tests/fixtures/planner/${name}`));
}

describe("parsePlannerCsv", () => {
  // covers: AC-905-1
  it("legge il file UTF-16LE con tabulazioni saltando le righe di titolo prima dei nomi colonna", () => {
    const parsed = parsePlannerCsv(fixture("keyword-stats-en-utf16le.csv"));

    expect(parsed.encoding).toBe("utf-16le");
    expect(parsed.separator).toBe("\t");
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows.map((row) => [row.keyword, row.avgMonthlySearches])).toEqual([
      ["caffe espresso", 1200],
      ["moka express", 8100],
      ["caffettiera moka 6 tazze", 590],
      ["macinacaffe manuale", 2400],
      ["tazzine caffe", 40],
    ]);
    expect(parsed.rows.every((row) => typeof row.avgMonthlySearches === "number" && row.precision === "exact")).toBe(true);
    expect(parsed.rows[0]).toMatchObject({
      competition: 0.12,
      lowTopOfPageBidMicros: 210_000n,
      highTopOfPageBidMicros: 950_000n,
    });
    expect(parsed.rows[4].lowTopOfPageBidMicros).toBeUndefined();
  });

  // covers: AC-905-2
  it("converte i range nel punto medio con precisione range e i separatori delle migliaia in un intero esatto", () => {
    const parsed = parsePlannerCsv(fixture("keyword-stats-ranges.csv"));
    const byKeyword = new Map(parsed.rows.map((row) => [row.keyword, row]));

    expect(byKeyword.get("moka express")).toMatchObject({ avgMonthlySearches: 5500, precision: "range" });
    expect(byKeyword.get("caffe espresso")).toMatchObject({ avgMonthlySearches: 1200, precision: "exact" });
    expect(byKeyword.get("caffettiera moka")).toMatchObject({ avgMonthlySearches: 550, precision: "range" });
    expect(byKeyword.get("macinacaffe")).toMatchObject({ avgMonthlySearches: 55_000, precision: "range" });
    expect(byKeyword.get("tazzine")).toMatchObject({ avgMonthlySearches: 1200, precision: "exact" });
  });

  it("riconosce le colonne italiane, i decimali con la virgola e il volume assente", () => {
    const parsed = parsePlannerCsv(fixture("keyword-stats-it-utf16le.csv"));

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      keyword: "caffè espresso",
      avgMonthlySearches: 1200,
      precision: "exact",
      competition: 0.12,
      lowTopOfPageBidMicros: 210_000n,
      highTopOfPageBidMicros: 950_000n,
    });
    expect(parsed.rows[1]).toMatchObject({ avgMonthlySearches: 8100, competition: 0.5 });
    expect(parsed.rows[2].avgMonthlySearches).toBeUndefined();
    expect(parsed.rows[2].competition).toBe(0.8);
  });

  // Struttura del primo file reale scaricato da Keyword Planner (2026-10-06), con keyword anonimizzate: volumi
  // decimali con «.0», colonna Segmentation e righe di riepilogo «Tutti»/«Italia» senza keyword, offerte tra
  // virgolette con la virgola decimale, «∞» nelle variazioni, livelli di concorrenza in italiano.
  it("legge il formato reale: volumi decimali con .0, righe di riepilogo scartate e offerte con la virgola", () => {
    const parsed = parsePlannerCsv(fixture("keyword-stats-real-2026-10-utf16le.csv"));

    expect(parsed).toMatchObject({ encoding: "utf-16le", separator: "\t", skippedRows: 2 });
    expect(parsed.rows.map((row) => [row.keyword, row.avgMonthlySearches, row.precision])).toEqual([
      ["caffè moka", 5000, "exact"],
      ["caffè moka prezzo", 50, "exact"],
      ["caffè moka elettrica", 100, "exact"],
      ["caffè moka 13 tazze", undefined, undefined],
      ["caffè moka università", 50, "exact"],
    ]);
    expect(parsed.rows[0]).toMatchObject({ competition: 0, lowTopOfPageBidMicros: 1_350_000n, highTopOfPageBidMicros: 4_430_000n });
    expect(parsed.rows[1]).toMatchObject({ competition: 0.86, lowTopOfPageBidMicros: undefined });
    expect(parsed.rows[2]).toMatchObject({ competition: 0.4, lowTopOfPageBidMicros: 140_000n, highTopOfPageBidMicros: 680_000n });
    expect(parsed.rows[4].competition).toBeUndefined();
  });

  it("rileva UTF-16BE e UTF-8 con BOM e scarta un file senza colonna keyword", () => {
    const text = "Keyword;Avg. monthly searches\nmoka;1.200\n";
    const utf16be = new Uint8Array([0xfe, 0xff, ...Buffer.from(text, "utf16le").swap16()]);
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(text, "utf8")]);

    expect(parsePlannerCsv(utf16be)).toMatchObject({ encoding: "utf-16be", separator: ";", rows: [{ keyword: "moka", avgMonthlySearches: 1200 }] });
    expect(parsePlannerCsv(utf8)).toMatchObject({ encoding: "utf-8", separator: ";", rows: [{ keyword: "moka", avgMonthlySearches: 1200 }] });
    expect(() => parsePlannerCsv(new Uint8Array(Buffer.from("a,b\n1,2\n")))).toThrow(/colonna Keyword/);
  });
});
