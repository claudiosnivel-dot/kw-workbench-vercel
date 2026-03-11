import { KeywordType, SearchIntent } from "@prisma/client";

export type ClassificationResult = {
  keyword_type: KeywordType;
  search_intent: SearchIntent;
  is_question: boolean;
  is_local_intent: boolean;
  is_tool_intent: boolean;
  is_commercial_intent: boolean;
};

const QUESTION_WORDS = ["how", "what", "when", "where", "why", "who", "which"];
const LOCAL_HINTS = ["near me", "in ", "open now", "closest", "local"];
const TOOL_HINTS = ["tool", "generator", "checker", "calculator", "software"];
const COMMERCIAL_HINTS = ["best", "top", "review", "pricing", "price", "cheap", "vs", "compare"];
const TRANSACTIONAL_HINTS = ["buy", "discount", "deal", "order", "coupon", "book"];
const NAVIGATIONAL_HINTS = ["login", "official", "website", "app"];
const PRODUCT_HINTS = ["product", "kit", "device", "accessory"];
const SERVICE_HINTS = ["service", "agency", "consultant", "freelance"];

export function classifyKeyword(keyword: string): ClassificationResult {
  const input = keyword.toLowerCase().trim();
  const isQuestion = input.endsWith("?") || QUESTION_WORDS.some((word) => input.startsWith(`${word} `));
  const isLocalIntent = LOCAL_HINTS.some((hint) => input.includes(hint));
  const isToolIntent = TOOL_HINTS.some((hint) => input.includes(hint));
  const isCommercialIntent = COMMERCIAL_HINTS.some((hint) => input.includes(hint));

  let keywordType: KeywordType = "generic";
  if (isQuestion) keywordType = "question";
  else if (input.includes(" vs ") || input.includes("compare")) keywordType = "comparison";
  else if (isLocalIntent) keywordType = "local";
  else if (isToolIntent) keywordType = "tool";
  else if (SERVICE_HINTS.some((hint) => input.includes(hint))) keywordType = "service";
  else if (PRODUCT_HINTS.some((hint) => input.includes(hint))) keywordType = "product";
  else if (input.includes("guide") || input.includes("ideas") || input.includes("tips")) keywordType = "content_topic";

  let searchIntent: SearchIntent = "mixed";
  if (TRANSACTIONAL_HINTS.some((hint) => input.includes(hint))) searchIntent = "transactional";
  else if (NAVIGATIONAL_HINTS.some((hint) => input.includes(hint))) searchIntent = "navigational";
  else if (isCommercialIntent) searchIntent = "commercial";
  else if (isQuestion) searchIntent = "informational";

  return {
    keyword_type: keywordType,
    search_intent: searchIntent,
    is_question: isQuestion,
    is_local_intent: isLocalIntent,
    is_tool_intent: isToolIntent,
    is_commercial_intent: isCommercialIntent,
  };
}
