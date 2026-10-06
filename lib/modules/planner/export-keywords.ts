import { keywordLimitIssue } from "@/lib/modules/keyword-limits";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

// Export delle keyword per «Ottieni volume di ricerca e previsioni» di Keyword Planner (T-904, D-09, D-26):
// file CSV con la sola colonna «Keyword» (modello di caricamento della guida Google Ads, fonte in
// docs/METRICS-PROVIDERS.md), una keyword per canonical, a blocchi.

/** Keyword per file: default prudente, il limite reale di Keyword Planner non è documentato (D-26). */
export const PLANNER_CHUNK_DEFAULT = 1000;
export const PLANNER_CHUNK_MAX = 10_000;

export type PlannerSkipReason = "too_long" | "too_many_words" | "formula_prefix";

/** Candidata in ordine keyword asc, id asc, con la lingua effettiva della sua sezione. */
export type PlannerExportRow = { keyword: string; languageCode: string };

export type PlannerExport = {
  parts: string[][];
  canonicals: number;
  skipped: { keyword: string; reason: PlannerSkipReason }[];
};

// Prefissi che un foglio di calcolo interpreta come formula (CWE-1236): queste keyword non si scrivono.
const FORMULA_PREFIX = /^[=+\-@]/;

/** Una keyword per canonical (la prima in ordine), senza quelle oltre i limiti o con un prefisso da formula. */
export function buildPlannerExport(rows: PlannerExportRow[], chunkSize: number): PlannerExport {
  const seen = new Set<string>();
  const keywords: string[] = [];
  const skipped: PlannerExport["skipped"] = [];

  for (const row of rows) {
    const canonical = canonicalizeKeyword(row.keyword, row.languageCode);
    if (!canonical || seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    const reason = keywordLimitIssue(row.keyword) ?? (FORMULA_PREFIX.test(row.keyword.trim()) ? "formula_prefix" : null);
    if (reason) {
      skipped.push({ keyword: row.keyword, reason });
    } else {
      keywords.push(row.keyword);
    }
  }

  const parts: string[][] = [];
  for (let index = 0; index < keywords.length; index += chunkSize) {
    parts.push(keywords.slice(index, index + chunkSize));
  }
  return { parts, canonicals: keywords.length, skipped };
}

/** Contenuto UTF-8 di un file: prima riga «Keyword», poi una keyword per riga. */
export function plannerPartCsv(keywords: string[]): string {
  return ["Keyword", ...keywords].join("\n") + "\n";
}

/** Nome del file: <projectId>-<sectionId o all>-partNN.csv, con NN a partire da 01. */
export function plannerPartFileName(projectId: string, sectionId: string | null, part: number): string {
  return `${projectId}-${sectionId ?? "all"}-part${String(part).padStart(2, "0")}.csv`;
}
