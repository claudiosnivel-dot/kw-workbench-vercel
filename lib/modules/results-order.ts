import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Ordinamento dei risultati (D-18, T-707): prima le keyword con punteggio da metriche reali, poi quelle
 * con solo punteggio euristico (l'enum ScoreSource dichiara metrics per primo), poi punteggio, keyword e
 * id per un ordine stabile. Unico per pagina dei risultati, API dei risultati ed export.
 */
export const RESULTS_ORDER_BY: Prisma.KeywordCandidateOrderByWithRelationInput[] = [
  { score_source: "asc" },
  { score: "desc" },
  { keyword: "asc" },
  { id: "asc" },
];

/**
 * Ordinamenti della pagina delle keyword (T-2403): più promettenti è l'ordine di D-18; ricerche dalla più cercata, le
 * keyword senza volume in fondo; A-Z per keyword. Tutti finiscono con id, per una paginazione stabile.
 */
export const RESULTS_SORTS = {
  promising: RESULTS_ORDER_BY,
  searches: [{ avg_monthly_searches: { sort: "desc", nulls: "last" } }, { keyword: "asc" }, { id: "asc" }],
  az: [{ keyword: "asc" }, { id: "asc" }],
} satisfies Record<string, Prisma.KeywordCandidateOrderByWithRelationInput[]>;
