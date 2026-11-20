import { z } from "zod";
import { requireProjectAccess, requireProjectScope } from "@/lib/authz/workspace";
import { KeywordType, SearchIntent } from "@/lib/generated/prisma/enums";
import { defineTool } from "@/lib/modules/agent/tool";
import { MAX_BULK_IDS } from "@/lib/modules/keywords-options";
import { applyBulkAction } from "@/lib/modules/results-bulk";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { RESULTS_SORTS } from "@/lib/modules/results-order";
import { loadResultsPage, type ResultsRow } from "@/lib/modules/results-query";

// Strumenti delle keyword del server MCP (T-7302, D-64): Claude Code legge le keyword con i loro dati e le tiene o le
// scarta con le regole della pagina delle keyword (T-2401, T-2403): perimetro del progetto e del workspace, filtri solo
// da valori in whitelist (parseResultsFilters, CWE-89).

/** Keyword per pagina di list_keywords (scelta dell'agente nel modulo 73). */
const AGENT_KEYWORDS_PAGE_SIZE = 200;

const SEARCH_MAX_LENGTH = 200;

const idField = (description: string) => z.string().min(1).max(64).describe(description);

/** Riga per Claude Code: i dati che servono al ragionamento SEO, con i nomi dell'API e non le colonne del DB. */
function toAgentKeyword(row: ResultsRow) {
  return {
    id: row.id,
    keyword: row.keyword,
    volume: row.avg_monthly_searches,
    score: row.score,
    intent: row.search_intent,
    type: row.keyword_type,
    question: row.is_question,
    local: row.is_local_intent,
    kept: row.review_status !== "rejected",
    topicId: row.subproject_id,
    topic: row.subproject.name,
  };
}

export const listKeywordsTool = defineTool({
  name: "list_keywords",
  description: `List the keywords of a project or of one of its topics, ${AGENT_KEYWORDS_PAGE_SIZE} per page, most promising first: id, keyword, monthly volume (null when unknown), score from 0 to 100, search intent, type, question, local, kept or discarded and topic, with the total and the number of pages.`,
  input: z
    .object({
      projectId: idField("Project id from list_projects or create_project"),
      topicId: idField("Topic id from get_project; the whole project when omitted").optional(),
      status: z.enum(["kept", "discarded", "all"]).optional().describe("kept (default), discarded or all"),
      minVolume: z.number().int().min(0).optional().describe("Only keywords with at least this monthly volume"),
      searchIntent: z.enum(SearchIntent).optional().describe("Only keywords with this search intent"),
      keywordType: z.enum(KeywordType).optional().describe("Only keywords of this type"),
      search: z.string().max(SEARCH_MAX_LENGTH).optional().describe("Only keywords containing this text"),
      page: z.number().int().min(1).optional().describe("Page number, from 1 (default)"),
    })
    .strict(),
  async run(input, { user, recordProject }) {
    const project = await requireProjectScope(user, input.projectId, input.topicId ?? null, "project.read");
    recordProject(project.id);
    const status = input.status ?? "kept";
    const filters = parseResultsFilters({
      status: status === "all" ? undefined : status,
      minVolume: input.minVolume?.toString(),
      searchIntent: input.searchIntent,
      keywordType: input.keywordType,
      searchText: input.search,
    });

    const page = await loadResultsPage({
      projectId: project.id,
      subprojectId: input.topicId ?? null,
      filters,
      page: input.page ?? 1,
      pageSize: AGENT_KEYWORDS_PAGE_SIZE,
      orderBy: RESULTS_SORTS.promising,
    });
    return {
      total: page.filteredCount,
      page: page.page,
      pages: page.totalPages,
      pageSize: AGENT_KEYWORDS_PAGE_SIZE,
      keywords: page.rows.map(toAgentKeyword),
    };
  },
});

export const setKeywordsTool = defineTool({
  name: "set_keywords",
  description: `Keep or discard keywords of a project by id (at most ${MAX_BULK_IDS} per call). Only kept keywords go into the plan. Answers with the number of keywords updated; ids of other projects are ignored.`,
  input: z
    .object({
      projectId: idField("Project id from list_projects or create_project"),
      action: z.enum(["keep", "discard"]).describe("keep or discard"),
      ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_BULK_IDS).describe("Keyword ids from list_keywords"),
    })
    .strict(),
  async run({ projectId, action, ids }, { user, recordProject }) {
    const project = await requireProjectAccess(user, projectId, "project.update", {});
    recordProject(project.id);
    return { updated: await applyBulkAction(project, { action, ids }) };
  },
});
