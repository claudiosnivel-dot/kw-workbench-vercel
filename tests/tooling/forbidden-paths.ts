/** Grafo delle dipendenze: file -> file importati (percorsi relativi alla radice, separatore /). */
export type DependencyGraph = Record<string, string[]>;

/** Regola del contratto di altitudine: nessun cammino da un file di `from` a un file di `to`. */
export type LayerRule = { from: string; to: string };

/** Pattern "cartella/**" (qualunque file sotto la cartella) oppure percorso esatto. */
function matches(file: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    return file.startsWith(pattern.slice(0, -2));
  }
  return file === pattern;
}

/** Restituisce, per ogni regola, i cammini (anche transitivi) che la violano: il più corto per coppia sorgente-destinazione. */
export function findForbiddenPaths(graph: DependencyGraph, rules: LayerRule[]): string[][] {
  const paths: string[][] = [];

  for (const rule of rules) {
    for (const source of Object.keys(graph).filter((file) => matches(file, rule.from))) {
      const parent = new Map<string, string | null>([[source, null]]);
      const queue = [source];

      while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const next of graph[current] ?? []) {
          if (parent.has(next)) continue;
          parent.set(next, current);
          queue.push(next);

          if (matches(next, rule.to)) {
            const path = [next];
            for (let step = parent.get(next); step != null; step = parent.get(step)) {
              path.unshift(step);
            }
            paths.push(path);
          }
        }
      }
    }
  }

  return paths;
}
