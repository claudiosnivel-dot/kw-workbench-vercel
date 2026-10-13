import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Regola unica tieni/scarta (T-2401, D-39): una keyword è tenuta se review_status è diverso da rejected, scartata se è
 * rejected. Le keyword nuove partono tenute (pending), quelle di un marchio escluso partono scartate; il piano, il
 * prossimo passo, i conteggi della barra laterale e della home e l'ambito di export kept usano questa regola.
 */
export const KEPT_WHERE = { review_status: { not: "rejected" } } satisfies Prisma.KeywordCandidateWhereInput;

export const DISCARDED_WHERE = { review_status: "rejected" } satisfies Prisma.KeywordCandidateWhereInput;
