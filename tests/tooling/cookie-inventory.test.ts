// Gate di T-1803 (AC-1803-3): ogni cookie impostato dal codice dell'app è nell'inventario, e sono tutti tecnici.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { COOKIE_INVENTORY } from "@/lib/legal/cookie-inventory";

const ROOTS = ["app", "lib", "components", "proxy.ts"];
const EXCLUDED = [join("lib", "generated")];

function sourceFiles(path: string): string[] {
  const absolute = join(process.cwd(), path);
  if (/\.(ts|tsx)$/.test(path)) {
    return [absolute];
  }
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (EXCLUDED.includes(child)) return [];
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx)$/.test(entry.name) ? [join(process.cwd(), child)] : [];
  });
}

/**
 * Nomi dei cookie impostati nel codice: il name di ogni cookies.set({ name: … }) o cookies.set(nome, …), con le costanti
 * risolte dalle dichiarazioni const NOME = "valore" dei file scansionati, più ogni letterale con il prefisso kwb_.
 */
function scanCookieNames(): { names: Set<string>; unresolved: string[] } {
  const files = ROOTS.flatMap(sourceFiles).map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const constants = new Map<string, string>();
  for (const { text } of files) {
    for (const match of text.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*"([^"]+)"/g)) {
      constants.set(match[1], match[2]);
    }
  }

  const names = new Set<string>();
  const unresolved: string[] = [];
  for (const { file, text } of files) {
    for (const match of text.matchAll(/cookies\.set\(\s*(?:\{\s*name:\s*)?([A-Za-z_][A-Za-z0-9_]*|"[^"]+")/g)) {
      const token = match[1];
      const name = token.startsWith('"') ? token.slice(1, -1) : constants.get(token);
      if (name) names.add(name);
      else unresolved.push(`${relative(process.cwd(), file)}: ${token}`);
    }
    for (const match of text.matchAll(/"(kwb_[a-z_]+)"/g)) {
      names.add(match[1]);
    }
  }
  return { names, unresolved };
}

describe("inventario dei cookie", () => {
  // covers: AC-1803-3
  it("la scansione del codice trova 0 nomi di cookie assenti dall'inventario, tutti tecnici", () => {
    const { names, unresolved } = scanCookieNames();
    const inventory = new Set(COOKIE_INVENTORY.map((entry) => entry.name));

    expect(unresolved).toEqual([]);
    // La scansione vede davvero i cookie: sessione, workspace, lingua e stato OAuth di Google Sheets.
    expect([...names].sort()).toEqual(["kwb_google_sheets_oauth_state", "kwb_locale", "kwb_session", "kwb_workspace"]);
    expect([...names].filter((name) => !inventory.has(name))).toEqual([]);
    expect(COOKIE_INVENTORY.every((entry) => entry.category === "technical")).toBe(true);
  });
});
