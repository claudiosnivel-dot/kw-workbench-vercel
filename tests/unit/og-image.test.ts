// Gate di T-2202 (AC-2202-1): l'immagine Open Graph con il logo del sito resta un PNG 1200x630 (T-1801, D-38).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("immagine Open Graph", () => {
  // covers: AC-2202-1
  it("public/og/site.png è un PNG 1200x630", () => {
    const png = readFileSync("public/og/site.png");

    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
