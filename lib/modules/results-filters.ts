import { BrandStatus, KeywordType, Prisma, ReviewStatus, SearchIntent } from "@/lib/generated/prisma/client";

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

export function parseResultsFilters(source: URLSearchParams | Record<string, string | string[] | undefined>): ResultsFilters {
  const getValue = (key: string): string | undefined => {
    if (source instanceof URLSearchParams) {
      return source.get(key) ?? undefined;
    }

    const value = source[key];
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  };

  const toNumber = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const toBool = (value: string | undefined): boolean => {
    if (!value) return false;
    return ["1", "true", "on", "yes"].includes(value.toLowerCase());
  };

  const brandStatusValue = getValue("brandStatus");
  const reviewStatusValue = getValue("reviewStatus");
  const searchIntentValue = getValue("searchIntent");
  const keywordTypeValue = getValue("keywordType");

  return {
    searchText: getValue("searchText")?.trim() || undefined,
    minVolume: toNumber(getValue("minVolume")),
    maxVolume: toNumber(getValue("maxVolume")),
    brandStatus: brandStatusValue && BRAND_STATUS.has(brandStatusValue as BrandStatus) ? (brandStatusValue as BrandStatus) : undefined,
    reviewStatus:
      reviewStatusValue && REVIEW_STATUS.has(reviewStatusValue as ReviewStatus)
        ? (reviewStatusValue as ReviewStatus)
        : undefined,
    selectedOnly: toBool(getValue("selectedOnly")),
    searchIntent:
      searchIntentValue && SEARCH_INTENTS.has(searchIntentValue as SearchIntent)
        ? (searchIntentValue as SearchIntent)
        : undefined,
    keywordType:
      keywordTypeValue && KEYWORD_TYPES.has(keywordTypeValue as KeywordType)
        ? (keywordTypeValue as KeywordType)
        : undefined,
    questionOnly: toBool(getValue("questionOnly")),
    toolIntentOnly: toBool(getValue("toolIntentOnly")),
    commercialOnly: toBool(getValue("commercialOnly")),
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
