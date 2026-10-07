import { getIntEnv } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import type { PlannerCsvRow } from "@/lib/modules/planner/csv-parser";
import { resolvePlannerScope } from "@/lib/modules/planner/scope";
import { touchProjectActivity } from "@/lib/modules/project-activity";
import { scoreKeyword } from "@/lib/modules/scoring";
import { prisma } from "@/lib/prisma";

/** Righe di un file oltre le quali l'import si rifiuta (CWE-400): un file da 5 MB ne contiene molte meno. */
export const PLANNER_IMPORT_MAX_ROWS = 100_000;

export class PlannerImportScopeError extends Error {
  constructor(readonly notFound: "project" | "section") {
    super(notFound === "project" ? "Progetto non trovato" : "Sezione non trovata");
    this.name = "PlannerImportScopeError";
  }
}

export type PlannerImportSummary = {
  /** Righe del file abbinate ad almeno una candidata. */
  matched: number;
  /** Righe con volume senza candidate con lo stesso canonical. */
  unmatched: number;
  /** Candidate aggiornate. */
  updated: number;
  /** Righe abbinate con volume a range (punto medio, D-17). */
  rangeRows: number;
  /** Righe senza volume («--» o vuoto): nessuna metrica da applicare. */
  withoutVolume: number;
};

/**
 * Applica i volumi del file di Keyword Planner alle candidate del progetto o della sezione (T-910): abbinamento con
 * canonicalizeKeyword nella lingua effettiva di ogni sezione (T-702), metriche, provider PLANNER_CSV, stato
 * imported, precisione e punteggio ricalcolato (T-707), tutto in una transazione e con update filtrati per
 * project_id e per il perimetro del workspace della rotta (T-1502; vuoto per la CLI dell'operatore).
 */
export async function applyPlannerImport(
  projectId: string,
  sectionId: string | null,
  rows: PlannerCsvRow[],
  perimeter: Prisma.ProjectWhereInput = {}
): Promise<PlannerImportSummary> {
  const scope = await resolvePlannerScope({ projectId, sectionId, perimeter });
  if ("notFound" in scope) {
    throw new PlannerImportScopeError(scope.notFound);
  }

  const withVolume = rows.filter((row) => row.avgMonthlySearches !== undefined);
  const candidates = await prisma.keywordCandidate.findMany({
    where: { project_id: scope.projectId, subproject_id: { in: scope.sections.map((section) => section.id) } },
    select: {
      id: true,
      subproject_id: true,
      keyword: true,
      normalized_keyword: true,
      canonical_keyword: true,
      brand_status: true,
      search_intent: true,
    },
  });
  const sectionById = new Map(scope.sections.map((section) => [section.id, section]));
  const candidatesByKey = new Map<string, (typeof candidates)[number][]>();
  for (const candidate of candidates) {
    const key = `${candidate.subproject_id}\u0000${candidate.canonical_keyword}`;
    candidatesByKey.set(key, [...(candidatesByKey.get(key) ?? []), candidate]);
  }

  const now = new Date();
  const updates: { id: string; data: Prisma.KeywordCandidateUpdateManyMutationInput }[] = [];
  const updatedIds = new Set<string>();
  let matched = 0;
  let rangeRows = 0;

  for (const row of withVolume) {
    const hits = scope.sections.flatMap(
      (section) => candidatesByKey.get(`${section.id}\u0000${canonicalizeKeyword(row.keyword, section.languageCode)}`) ?? []
    );
    const fresh = hits.filter((candidate) => !updatedIds.has(candidate.id));
    if (hits.length === 0) {
      continue;
    }
    matched += 1;
    rangeRows += row.precision === "range" ? 1 : 0;

    for (const candidate of fresh) {
      updatedIds.add(candidate.id);
      const { score, score_source } = scoreKeyword({
        raw_keyword: candidate.keyword,
        keyword: candidate.normalized_keyword,
        brand_status: candidate.brand_status,
        search_intent: candidate.search_intent,
        metrics_status: "imported",
        avg_monthly_searches: row.avgMonthlySearches,
        competition: row.competition,
        low_top_of_page_bid_micros: row.lowTopOfPageBidMicros,
        high_top_of_page_bid_micros: row.highTopOfPageBidMicros,
        scoring_profile: sectionById.get(candidate.subproject_id)?.scoringProfile ?? "balanced",
      });
      updates.push({
        id: candidate.id,
        data: {
          avg_monthly_searches: row.avgMonthlySearches,
          competition: row.competition ?? null,
          low_top_of_page_bid_micros: row.lowTopOfPageBidMicros ?? null,
          high_top_of_page_bid_micros: row.highTopOfPageBidMicros ?? null,
          metrics_provider: "PLANNER_CSV",
          metrics_status: "imported",
          metrics_precision: row.precision ?? null,
          metrics_updated_at: now,
          score,
          score_source,
        },
      });
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        for (const update of updates) {
          await tx.keywordCandidate.updateMany({
            where: { id: update.id, project_id: scope.projectId, project: scope.perimeter },
            data: update.data,
          });
        }
        await touchProjectActivity(tx, { id: scope.projectId, perimeter: scope.perimeter }, now);
      },
      { timeout: getIntEnv("EXTRACTION_TX_TIMEOUT_MS") }
    );
  }

  return {
    matched,
    unmatched: withVolume.length - matched,
    updated: updates.length,
    rangeRows,
    withoutVolume: rows.length - withVolume.length,
  };
}
