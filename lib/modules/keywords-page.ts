import type { Prisma } from "@/lib/generated/prisma/client";
import { readParam, type SearchParamsSource } from "@/lib/http/search-params";
import { KEPT_WHERE } from "@/lib/modules/keep-rule";
import {
  KEYWORD_CHIPS,
  type KeywordChip,
  type KeywordRowData,
  KEYWORD_SORTS,
  type KeywordSort,
  VIEW_FILTER_PARAMS,
} from "@/lib/modules/keywords-options";
import { buildResultsClauses, CHIP_WHERE, parseResultsFilters, type ResultsFilters } from "@/lib/modules/results-filters";
import { RESULTS_SORTS } from "@/lib/modules/results-order";
import { parsePagingParams } from "@/lib/modules/results-paging";
import { loadResultsPage, type ResultsPage } from "@/lib/modules/results-query";
import { toUrlSearchParams } from "@/lib/modules/results-view";
import { type VolumesReason, volumesReasonOf } from "@/lib/modules/volumes-reason";
import { prisma } from "@/lib/prisma";

/** Righe della pagina delle keyword: tenute ed elenco delle scartate, ciascuno con la sua paginazione (T-801). */
export type KeywordsView = {
  kept: ResultsPage;
  discarded: ResultsPage;
  /** Tenute del perimetro (argomento o progetto) senza i filtri della vista: «M tenute». */
  keptTotal: number;
  /** Tenute della vista con ogni filtro tranne il chip: «Tutte» e un conteggio per chip. */
  chipCounts: Record<"all" | KeywordChip, number>;
  /** Tenute del perimetro con le ricerche al mese: con 0 la pagina dell'argomento propone «Aggiungi i volumi» (T-2405). */
  keptWithVolume: number;
  sort: KeywordSort;
  /** Parametri dei filtri attivi della vista (chip, cerca, Filtri): passano alle azioni massive e all'export. */
  filterParams: Record<string, string>;
};

/** Parametro della pagina dell'elenco delle scartate, separato dalla pagina delle tenute. */
export const DISCARDED_PAGE_PARAM = "discardedPage";

function readSort(source: SearchParamsSource): KeywordSort {
  const value = readParam(source, "sort");
  return KEYWORD_SORTS.includes(value as KeywordSort) ? (value as KeywordSort) : "promising";
}

/** Solo i parametri dei filtri della vista con un valore valido, nell'ordine di VIEW_FILTER_PARAMS. */
function activeFilterParams(source: SearchParamsSource, filters: ResultsFilters): Record<string, string> {
  const params = toUrlSearchParams(source);
  const valid: Record<(typeof VIEW_FILTER_PARAMS)[number], unknown> = {
    chip: filters.chip,
    searchText: filters.searchText,
    minVolume: filters.minVolume,
    maxVolume: filters.maxVolume,
    searchIntent: filters.searchIntent,
    keywordType: filters.keywordType,
    brandStatus: filters.brandStatus,
    questionOnly: filters.questionOnly || undefined,
    toolIntentOnly: filters.toolIntentOnly || undefined,
    commercialOnly: filters.commercialOnly || undefined,
  };
  return Object.fromEntries(
    VIEW_FILTER_PARAMS.filter((key) => valid[key] !== undefined).map((key) => [key, params.get(key) ?? ""])
  );
}

function countWhere(clauses: Prisma.KeywordCandidateWhereInput[]): Promise<number> {
  return prisma.keywordCandidate.count({ where: { AND: clauses } });
}

/**
 * Dati della pagina delle keyword di un argomento o del progetto (T-2403). projectId è già risolto nel workspace
 * dell'utente e topicId è un argomento di quel progetto (o null per la vista del progetto): ogni where parte da
 * project_id (buildResultsClauses). Le tenute e le scartate usano la stessa vista (chip, cerca, Filtri, ordinamento);
 * i conteggi dei chip contano le tenute con gli altri filtri.
 */
export async function loadKeywordsView(projectId: string, topicId: string | null, source: SearchParamsSource): Promise<KeywordsView> {
  const filters = parseResultsFilters(source);
  delete filters.status;
  const sort = readSort(source);
  const { page, pageSize } = parsePagingParams(source);
  const discardedPage = parsePagingParams({ page: readParam(source, DISCARDED_PAGE_PARAM) }).page;
  const orderBy = RESULTS_SORTS[sort];
  const keptWithoutChip = buildResultsClauses(projectId, { ...filters, chip: undefined, status: "kept" }, topicId);
  const perimeter = buildResultsClauses(projectId, {}, topicId);

  const [kept, discarded, keptTotal, keptWithVolume, all, ...chips] = await Promise.all([
    loadResultsPage({ projectId, subprojectId: topicId, filters: { ...filters, status: "kept" }, page, pageSize, orderBy }),
    loadResultsPage({ projectId, subprojectId: topicId, filters: { ...filters, status: "discarded" }, page: discardedPage, pageSize, orderBy }),
    countWhere([...perimeter, KEPT_WHERE]),
    countWhere([...perimeter, KEPT_WHERE, { avg_monthly_searches: { not: null } }]),
    countWhere(keptWithoutChip),
    ...KEYWORD_CHIPS.map((chip) => countWhere([...keptWithoutChip, CHIP_WHERE[chip]])),
  ]);

  return {
    kept,
    discarded,
    keptTotal,
    keptWithVolume,
    chipCounts: { all, ...Object.fromEntries(KEYWORD_CHIPS.map((chip, index) => [chip, chips[index]])) } as KeywordsView["chipCounts"],
    sort,
    filterParams: activeFilterParams(source, filters),
  };
}

/**
 * Ultima ricerca completata di un argomento del progetto (T-3703, T-3704): null se non ce n'è nessuna, altrimenti il
 * motivo dei volumi mancanti letto dal suo result. projectId e topicId sono già risolti nel workspace dell'utente.
 */
export async function loadLastCompletedSearch(projectId: string, topicId: string): Promise<{ volumesReason: VolumesReason | null } | null> {
  const job = await prisma.job.findFirst({
    where: { project_id: projectId, subproject_id: topicId, status: "completed" },
    orderBy: [{ completed_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
    select: { result: true },
  });
  return job ? { volumesReason: volumesReasonOf(job.result) } : null;
}

/** Riga per i componenti della pagina (T-2403): la colonna Argomento solo nella vista del progetto. */
export function toKeywordRow(row: ResultsPage["rows"][number], withTopic: boolean): KeywordRowData {
  return {
    id: row.id,
    keyword: row.keyword,
    topicName: withTopic ? row.subproject.name : null,
    searches: row.avg_monthly_searches,
    score: row.score,
    question: row.is_question,
    buy: row.search_intent === "commercial" || row.search_intent === "transactional",
    local: row.is_local_intent,
    brandReview: row.brand_status === "review",
    source: row.source,
    intent: row.search_intent,
    type: row.keyword_type,
    competition: row.competition,
    discarded: row.review_status === "rejected",
  };
}

function pagingOf(page: ResultsPage) {
  return { page: page.page, totalPages: page.totalPages, start: page.pageStart, end: page.pageEnd, total: page.filteredCount };
}

/** Dati della vista nella forma dei componenti della pagina (KeywordsBoard): righe, conteggi e paginazioni. */
export function keywordsBoardProps(view: KeywordsView, withTopic: boolean) {
  return {
    kept: view.kept.rows.map((row) => toKeywordRow(row, withTopic)),
    discarded: view.discarded.rows.map((row) => toKeywordRow(row, withTopic)),
    counts: {
      found: view.kept.scopeTotalCount,
      keptTotal: view.keptTotal,
      keptFiltered: view.kept.filteredCount,
      discardedFiltered: view.discarded.filteredCount,
    },
    keptPaging: pagingOf(view.kept),
    discardedPaging: pagingOf(view.discarded),
    chipCounts: view.chipCounts,
    sort: view.sort,
    filterParams: view.filterParams,
  };
}
