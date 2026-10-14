// Gate di T-2605 (AC-2605-2): i colori di stato del percorso (--status-done, --status-progress, --status-danger) hanno
// un contrasto WCAG di almeno 4,5:1 sul fondo di ciascun tema, nei due estremi del gradiente (--bg-0 e --bg-1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const STATUS_VARIABLES = ["--status-done", "--status-progress", "--status-danger"];
const BACKGROUNDS = ["--bg-0", "--bg-1"];

/** Dichiarazioni del blocco del tema: il primo blocco il cui selettore termina con quello indicato. */
function themeBlock(selector: string): Map<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  const body = CSS.slice(start, CSS.indexOf("}", start));
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

/** Valore di una variabile, seguendo i var(--x) dentro lo stesso blocco. */
function resolve(block: Map<string, string>, name: string): string {
  const value = block.get(name);
  expect(value, name).toBeDefined();
  const reference = /^var\((--[\w-]+)\)$/.exec(value ?? "");
  return reference ? resolve(block, reference[1]) : (value ?? "");
}

function luminance(hex: string): number {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("colori di stato del percorso", () => {
  // covers: AC-2605-2
  it.each([
    ["scuro", 'html[data-theme="DARK"]'],
    ["chiaro", 'html[data-theme="LIGHT"]'],
  ])("nel tema %s ogni colore di stato ha contrasto almeno 4,5 sul fondo", (_name, selector) => {
    const block = themeBlock(selector);
    const ratios = STATUS_VARIABLES.flatMap((variable) =>
      BACKGROUNDS.map((background) => ({
        pair: `${variable} su ${background}`,
        ratio: contrast(resolve(block, variable), resolve(block, background)),
      }))
    );

    expect(ratios.filter(({ ratio }) => ratio < 4.5)).toEqual([]);
    expect(ratios).toHaveLength(STATUS_VARIABLES.length * BACKGROUNDS.length);
  });
});
