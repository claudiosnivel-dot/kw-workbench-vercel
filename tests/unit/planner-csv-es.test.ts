// Gate di T-5002 (AC-5002-1, D-47): file di Keyword Planner scaricato con Google Ads in spagnolo, su una fixture
// costruita dalle intestazioni della documentazione di Google Ads in spagnolo (docs/METRICS-PROVIDERS.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlannerCsv } from "@/lib/modules/planner/csv-parser";

describe("parsePlannerCsv in spagnolo", () => {
  // covers: AC-5002-1
  it("legge le colonne spagnole, l'intervallo «10 mil - 100 mil» e la puja con la virgola decimale", () => {
    const parsed = parsePlannerCsv(new Uint8Array(readFileSync("tests/fixtures/planner/keyword-planner-es.csv")));

    expect(parsed).toMatchObject({ encoding: "utf-16le", separator: "\t", skippedRows: 0 });
    expect(parsed.rows.map((row) => row.keyword)).toEqual([
      "cama de hospital",
      "cama de hospital precio",
      "alquiler cama de hospital",
    ]);
    expect(parsed.rows[1]).toMatchObject({ avgMonthlySearches: 55_000, precision: "range" });
    expect(parsed.rows[2].lowTopOfPageBidMicros).toBe(1_250_000n);
  });

  it("numeri con il punto delle migliaia, intervallo «1000 - 10.000» e livelli di competencia", () => {
    const parsed = parsePlannerCsv(new Uint8Array(readFileSync("tests/fixtures/planner/keyword-planner-es.csv")));

    expect(parsed.rows[0]).toMatchObject({
      avgMonthlySearches: 5_500,
      precision: "range",
      competition: 0.2,
      lowTopOfPageBidMicros: 210_000n,
      highTopOfPageBidMicros: 950_000n,
    });
    expect(parsed.rows[1].competition).toBe(0.5);
    expect(parsed.rows[2]).toMatchObject({ avgMonthlySearches: 1_900, precision: "exact", competition: 0.8 });
  });
});
