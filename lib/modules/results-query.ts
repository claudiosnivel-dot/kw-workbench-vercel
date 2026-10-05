import type { Prisma } from "@/lib/generated/prisma/client";
import { buildResultsWhere, type ResultsFilters } from "@/lib/modules/results-filters";
import { RESULTS_ORDER_BY } from "@/lib/modules/results-order";
import { prisma } from "@/lib/prisma";

const RESULTS_ROW_SELECT = {
  id: true,
  project_id: true,
  subproject_id: true,
  keyword: true,
  normalized_keyword: true,
  canonical_keyword: true,
  source: true,
  source_query: true,
  brand_status: true,
  brand_reason: true,
  review_status: true,
  selected_for_export: true,
  keyword_type: true,
  search_intent: true,
  is_question: true,
  is_local_intent: true,
  is_tool_intent: true,
  is_commercial_intent: true,
  metrics_status: true,
  metrics_provider: true,
  avg_monthly_searches: true,
  competition: true,
  low_top_of_page_bid_micros: true,
  high_top_of_page_bid_micros: true,
  score: true,
  score_source: true,
  metrics_updated_at: true,
  created_at: true,
  updated_at: true,
  subproject: { select: { name: true } },
} satisfies Prisma.KeywordCandidateSelect;

export type ResultsRow = Prisma.KeywordCandidateGetPayload<{ select: typeof RESULTS_ROW_SELECT }>;

export type ResultsPage = {
  rows: ResultsRow[];
  filteredCount: number;
  scopeTotalCount: number;
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
};

/**
 * Una pagina dei risultati della vista (sezione o progetto) per pagina dei risultati e API (T-801).
 * projectId è già verificato come posseduto dall'utente e subprojectId come sezione di quel progetto:
 * il where parte sempre da project_id. I 2 count (filtrati e totale della vista) e la findMany della
 * pagina richiesta partono insieme; se la pagina supera l'ultima si ripete solo la findMany sull'ultima.
 */
export async function loadResultsPage(params: {
  projectId: string;
  subprojectId: string | null;
  filters: ResultsFilters;
  page: number;
  pageSize: number;
}): Promise<ResultsPage> {
  const { projectId, subprojectId, filters, pageSize } = params;
  const where = buildResultsWhere(projectId, filters, subprojectId);
  const scopeWhere: Prisma.KeywordCandidateWhereInput = subprojectId
    ? { project_id: projectId, subproject_id: subprojectId }
    : { project_id: projectId };
  const readPage = (page: number) =>
    prisma.keywordCandidate.findMany({
      where,
      orderBy: RESULTS_ORDER_BY,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: RESULTS_ROW_SELECT,
    });

  const [filteredCount, scopeTotalCount, requestedRows] = await Promise.all([
    prisma.keywordCandidate.count({ where }),
    prisma.keywordCandidate.count({ where: scopeWhere }),
    readPage(params.page),
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const page = Math.min(params.page, totalPages);
  const rows = page === params.page ? requestedRows : await readPage(page);

  return {
    rows,
    filteredCount,
    scopeTotalCount,
    page,
    totalPages,
    pageStart: filteredCount === 0 ? 0 : (page - 1) * pageSize + 1,
    pageEnd: Math.min(filteredCount, page * pageSize),
  };
}
