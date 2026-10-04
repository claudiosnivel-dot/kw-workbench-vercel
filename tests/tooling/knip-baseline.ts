/** Segnalazione di knip normalizzata: tipo di issue (files, exports, types, ...), file e simbolo. */
export type KnipTriple = { type: string; file: string; symbol: string };

type KnipIssue = { file: string } & Record<string, unknown>;
export type KnipReport = { issues: KnipIssue[] };
export type KnipBaseline = { entries: (KnipTriple & { note?: string })[] };

function key({ type, file, symbol }: KnipTriple): string {
  return `${type}\u0000${file}\u0000${symbol}`;
}

/** Trasforma il report JSON di knip in triple (tipo, file, simbolo). */
export function normalizeKnipReport(report: KnipReport): KnipTriple[] {
  const triples: KnipTriple[] = [];
  for (const issue of report.issues) {
    for (const [type, value] of Object.entries(issue)) {
      if (!Array.isArray(value)) continue;
      for (const item of value as { name?: string }[]) {
        if (item && typeof item.name === "string") {
          triples.push({ type, file: issue.file, symbol: item.name });
        }
      }
    }
  }
  return triples;
}

/** Restituisce le segnalazioni del report assenti dalla baseline: il morto nuovo. */
export function diffKnipAgainstBaseline(report: KnipReport, baseline: KnipBaseline): KnipTriple[] {
  const known = new Set(baseline.entries.map(key));
  return normalizeKnipReport(report).filter((triple) => !known.has(key(triple)));
}
