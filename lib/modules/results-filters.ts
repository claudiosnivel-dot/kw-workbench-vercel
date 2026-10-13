import { BrandStatus, KeywordType, Prisma, SearchIntent } from "@/lib/generated/prisma/client";
import { readFlag, readNumber, readParam, type SearchParamsSource } from "@/lib/http/search-params";
import { DISCARDED_WHERE, KEPT_WHERE } from "@/lib/modules/keep-rule";
import { KEEP_STATUSES, type KeepStatus, KEYWORD_CHIPS, type KeywordChip } from "@/lib/modules/keywords-options";

export type ResultsFilters = {
  searchText?: string;
  minVolume?: number;
  maxVolume?: number;
  brandStatus?: BrandStatus;
  /** Tenute o scartate (T-2401): sostituisce i vecchi filtri reviewStatus e selectedOnly. */
  status?: KeepStatus;
  /** Filtro rapido della pagina delle keyword (T-2403). */
  chip?: KeywordChip;
  searchIntent?: SearchIntent;
  keywordType?: KeywordType;
  questionOnly?: boolean;
  toolIntentOnly?: boolean;
  commercialOnly?: boolean;
};

const BRAND_STATUS = new Set<BrandStatus>(["allowed", "excluded", "review"]);
const SEARCH_INTENTS = new Set<SearchIntent>([
  "informational",
  "commercial",
  "transactional",
  "navigational",
  "mixed",
]);
const KEYWORD_TYPES = new Set<KeywordType>([
  "generic",
  "question",
  "comparison",
  "branded",
  "local",
  "tool",
  "service",
  "product",
  "content_topic",
]);

/** Clausola di ogni filtro rapido (T-2403): domande, per comprare, locali e marchi (consentiti esclusi). */
export const CHIP_WHERE: Record<KeywordChip, Prisma.KeywordCandidateWhereInput> = {
  questions: { is_question: true },
  buy: { search_intent: { in: ["commercial", "transactional"] } },
  local: { is_local_intent: true },
  brands: { brand_status: { not: "allowed" } },
};

export function parseResultsFilters(source: SearchParamsSource): ResultsFilters {
  const brandStatusValue = readParam(source, "brandStatus");
  const statusValue = readParam(source, "status");
  const chipValue = readParam(source, "chip");
  const searchIntentValue = readParam(source, "searchIntent");
  const keywordTypeValue = readParam(source, "keywordType");

  return {
    searchText: readParam(source, "searchText").trim() || undefined,
    minVolume: readNumber(source, "minVolume"),
    maxVolume: readNumber(source, "maxVolume"),
    brandStatus: brandStatusValue && BRAND_STATUS.has(brandStatusValue as BrandStatus) ? (brandStatusValue as BrandStatus) : undefined,
    status: KEEP_STATUSES.includes(statusValue as KeepStatus) ? (statusValue as KeepStatus) : undefined,
    chip: KEYWORD_CHIPS.includes(chipValue as KeywordChip) ? (chipValue as KeywordChip) : undefined,
    searchIntent:
      searchIntentValue && SEARCH_INTENTS.has(searchIntentValue as SearchIntent)
        ? (searchIntentValue as SearchIntent)
        : undefined,
    keywordType:
      keywordTypeValue && KEYWORD_TYPES.has(keywordTypeValue as KeywordType)
        ? (keywordTypeValue as KeywordType)
        : undefined,
    questionOnly: readFlag(source, "questionOnly"),
    toolIntentOnly: readFlag(source, "toolIntentOnly"),
    commercialOnly: readFlag(source, "commercialOnly"),
  };
}

export function buildResultsWhere(
  projectId: string,
  filters: ResultsFilters,
  subprojectId?: string | null
): Prisma.KeywordCandidateWhereInput {
  return { AND: buildResultsClauses(projectId, filters, subprojectId) };
}

/** Clausole in AND della vista (progetto, sezione e filtri): la prima è sempre project_id. */
export function buildResultsClauses(
  projectId: string,
  filters: ResultsFilters,
  subprojectId?: string | null
): Prisma.KeywordCandidateWhereInput[] {
  const andFilters: Prisma.KeywordCandidateWhereInput[] = [{ project_id: projectId }];

  if (subprojectId) {
    andFilters.push({ subproject_id: subprojectId });
  }

  if (filters.searchText) {
    andFilters.push({
      OR: [
        { keyword: { contains: filters.searchText, mode: "insensitive" } },
        { normalized_keyword: { contains: filters.searchText, mode: "insensitive" } },
      ],
    });
  }

  if (typeof filters.minVolume === "number") {
    andFilters.push({ avg_monthly_searches: { gte: filters.minVolume } });
  }

  if (typeof filters.maxVolume === "number") {
    andFilters.push({ avg_monthly_searches: { lte: filters.maxVolume } });
  }

  if (filters.brandStatus) {
    andFilters.push({ brand_status: filters.brandStatus });
  }

  if (filters.status) {
    andFilters.push(filters.status === "kept" ? KEPT_WHERE : DISCARDED_WHERE);
  }

  if (filters.chip) {
    andFilters.push(CHIP_WHERE[filters.chip]);
  }

  if (filters.searchIntent) {
    andFilters.push({ search_intent: filters.searchIntent });
  }

  if (filters.keywordType) {
    andFilters.push({ keyword_type: filters.keywordType });
  }

  if (filters.questionOnly) {
    andFilters.push({ is_question: true });
  }

  if (filters.toolIntentOnly) {
    andFilters.push({ is_tool_intent: true });
  }

  if (filters.commercialOnly) {
    andFilters.push({ is_commercial_intent: true });
  }

  return andFilters;
}
