// Gate di T-804 (AC-804-1…4): il CSV di default si apre in Excel italiano (BOM, ';', decimali con la
// virgola, CRLF), il dialetto rfc4180 resta disponibile, le celle testuali che inizierebbero una
// formula sono neutralizzate con un apostrofo (CWE-1236) e con 0 righe resta l'intestazione.
import { describe, expect, it } from "vitest";
import { serializeCsv, type ExportRow } from "@/lib/modules/export";

const BOM = [0xef, 0xbb, 0xbf];

function exportRow(overrides: Partial<ExportRow> = {}): ExportRow {
  return {
    subproject_name: "Generale",
    keyword: "scarpe running",
    normalized_keyword: "scarpe running",
    canonical_keyword: "scarpe running",
    source: "seed",
    source_query: "scarpe",
    brand_status: "allowed",
    review_status: "approved",
    selected_for_export: true,
    keyword_type: "generic",
    search_intent: "commercial",
    is_question: false,
    is_local_intent: false,
    is_tool_intent: false,
    is_commercial_intent: true,
    metrics_status: "fetched",
    metrics_provider: "MOCK",
    avg_monthly_searches: 1200,
    competition: null,
    low_top_of_page_bid_micros: null,
    high_top_of_page_bid_micros: null,
    score: null,
    score_source: "metrics",
    ...overrides,
  };
}

const COLUMN_COUNT = Object.keys(exportRow()).length;

/** Parser CSV minimo per i test: campi tra doppi apici con apici raddoppiati, righe chiuse da CRLF. */
function parseCsv(text: string, separator: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      record.push(field);
      field = "";
    } else if (char === "\r" && text[index + 1] === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      index += 1;
    } else {
      field += char;
    }
  }
  return records;
}

function decode(buffer: Uint8Array): string {
  return new TextDecoder("utf-8", { ignoreBOM: false }).decode(buffer);
}

describe("serializeCsv", () => {
  // covers: AC-804-1
  it("excel-it: BOM, 3 righe chiuse da CRLF e intestazione con una colonna per chiave di ExportRow", () => {
    const buffer = serializeCsv([exportRow(), exportRow({ keyword: "borsa pelle" })], { dialect: "excel-it" });
    const text = decode(buffer);
    const lines = text.replace(/\r\n$/, "").split("\r\n");

    expect(Array.from(buffer.slice(0, 3))).toEqual(BOM);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[0].split(";")).toHaveLength(COLUMN_COUNT);
    expect(COLUMN_COUNT).toBe(23);
  });

  // covers: AC-804-2
  it("prefissa con un apostrofo le celle testuali che inizierebbero una formula, non i numeri", () => {
    const dangerous = ["=1+1", "+39 333 1234567", "-sconto", "@SUM(A1)", "\tx", "\ry"];
    const rows = [...dangerous, "scarpe running"].map((keyword) => exportRow({ keyword }));

    const [header, ...records] = parseCsv(decode(serializeCsv(rows, { dialect: "excel-it" })), ";");
    const keywordCells = records.map((record) => record[header.indexOf("keyword")]);
    const volumeCells = records.map((record) => record[header.indexOf("avg_monthly_searches")]);

    expect(keywordCells.slice(0, 6)).toEqual(["'=1+1", "'+39 333 1234567", "'-sconto", "'@SUM(A1)", "'\tx", "'\ry"]);
    expect(keywordCells[6]).toBe("scarpe running");
    expect(volumeCells[0]).toBe("1200");
  });

  // covers: AC-804-3
  it("decimali con la virgola in excel-it e con il punto in rfc4180, senza BOM e con ','", () => {
    const row = exportRow({ competition: 0.35, score: 51.25 });

    const excelBuffer = serializeCsv([row], { dialect: "excel-it" });
    const rfcBuffer = serializeCsv([row], { dialect: "rfc4180" });
    const [excelHeader, excelRecord] = parseCsv(decode(excelBuffer), ";");
    const [rfcHeader, rfcRecord] = parseCsv(decode(rfcBuffer), ",");

    expect(excelRecord[excelHeader.indexOf("competition")]).toBe("0,35");
    expect(excelRecord[excelHeader.indexOf("score")]).toBe("51,25");
    expect(rfcRecord[rfcHeader.indexOf("competition")]).toBe("0.35");
    expect(rfcRecord[rfcHeader.indexOf("score")]).toBe("51.25");
    expect(rfcHeader).toHaveLength(COLUMN_COUNT);
    expect(Array.from(rfcBuffer.slice(0, 3))).not.toEqual(BOM);
  });

  // covers: AC-804-4
  it("con 0 righe scrive BOM e la sola intestazione chiusa da CRLF", () => {
    const buffer = serializeCsv([], { dialect: "excel-it" });
    const text = decode(buffer);

    expect(Array.from(buffer.slice(0, 3))).toEqual(BOM);
    expect(buffer.length).toBeGreaterThan(3);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n$/, "").split("\r\n")).toHaveLength(1);
    expect(text.replace(/^﻿/, "").replace(/\r\n$/, "").split(";")).toHaveLength(COLUMN_COUNT);
  });
});
