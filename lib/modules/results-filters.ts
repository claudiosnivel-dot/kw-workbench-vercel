import { BrandStatus, KeywordType, Prisma, ReviewStatus, SearchIntent } from "@/lib/generated/prisma/client";
import { readFlag, readNumber, readParam, type SearchParamsSource } from "@/lib/http/search-params";

export type ResultsFilters = {
  searchText?: string;
  minVolume?: number;
  maxVolume?: number;
  brandStatus?: BrandStatus;
  reviewStatus?: ReviewStatus;
  selectedOnly?: boolean;
  searchIntent?: SearchIntent;
  keywordType?: KeywordType;
  questionOnly?: boolean;
  toolIntentOnly?: boolean;
  commercialOnly?: boolean;
};

const BRAND_STATUS = new Set<BrandStatus>(["allowed", "excluded", "review"]);
const REVIEW_STATUS = new Set<ReviewStatus>(["pending", "approved", "rejected"]);
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

export function parseResultsFilters(source: SearchParamsSource): ResultsFilters {
  const brandStatusValue = readParam(source, "brandStatus");
  const reviewStatusValue = readParam(source, "reviewStatus");
  const searchIntentValue = readParam(source, "searchIntent");
  const keywordTypeValue = readParam(source, "keywordType");

  return {
    searchText: readParam(source, "searchText").trim() || undefined,
    minVolume: readNumber(source, "minVolume"),
    maxVolume: readNumber(source, "maxVolume"),
    brandStatus: brandStatusValue && BRAND_STATUS.has(brandStatusValue as BrandStatus) ? (brandStatusValue as BrandStatus) : undefined,
    reviewStatus:
      reviewStatusValue && REVIEW_STATUS.has(reviewStatusValue as ReviewStatus)
        ? (reviewStatusValue as ReviewStatus)
        : undefined,
    selectedOnly: readFlag(source, "selectedOnly"),
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

  if (filters.reviewStatus) {
    andFilters.push({ review_status: filters.reviewStatus });
  }

  if (filters.selectedOnly) {
    andFilters.push({ selected_for_export: true });
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
