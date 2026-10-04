// Gate di T-405 (AC-405-2): Tailwind 4.3 con @tailwindcss/postcss e configurazione CSS-first.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("Tailwind 4.3", () => {
  // covers: AC-405-2
  it("dipendenze 4.3 esatte, niente autoprefixer né tailwind.config.ts, PostCSS e CSS in formato v4", () => {
    const pkg = JSON.parse(read("package.json")) as Record<string, Record<string, string> | undefined>;
    const versions = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(versions.tailwindcss).toMatch(/^4\.3\.\d+$/);
    expect(versions["@tailwindcss/postcss"]).toMatch(/^4\.3\.\d+$/);
    expect(versions).not.toHaveProperty("autoprefixer");
    expect(existsSync(join(ROOT, "tailwind.config.ts"))).toBe(false);
    expect(read("postcss.config.mjs")).toContain("@tailwindcss/postcss");
    expect(read("app/globals.css")).not.toContain("@tailwind");
  });
});
