import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Instradamento delle rotte API come nel router di Next.js: segmenti statici, poi dinamici `[x]`, poi
 * catch-all `[...x]`; senza un route.ts che esporti il metodo, Next risponde 404 (o 405 se il metodo manca).
 * La risposta reale di Next per la rotta rimossa è provata anche dallo smoke E2E.
 */
export async function dispatch(method: "GET" | "POST" | "PATCH", pathname: string): Promise<number> {
  let dir = "app";
  for (const segment of pathname.split("/").filter(Boolean)) {
    const entries = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
    const next =
      entries.find((entry) => entry.name === segment) ??
      entries.find((entry) => /^\[[^.]+\]$/.test(entry.name)) ??
      entries.find((entry) => /^\[\[?\.\.\./.test(entry.name));
    if (!next) {
      return 404;
    }
    dir = path.join(dir, next.name);
    if (/^\[\[?\.\.\./.test(next.name)) {
      break;
    }
  }
  const routeFile = path.join(dir, "route.ts");
  if (!existsSync(routeFile)) {
    return 404;
  }
  const handlers = (await import(/* @vite-ignore */ path.resolve(routeFile))) as Record<string, unknown>;
  return typeof handlers[method] === "function" ? 200 : 405;
}
