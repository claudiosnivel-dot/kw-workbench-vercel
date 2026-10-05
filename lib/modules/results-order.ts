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
