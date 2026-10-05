import { KeywordType, SearchIntent } from "@/lib/generated/prisma/enums";
import { containsTokenSequence, normalizeKeyword } from "@/lib/modules/normalization";

export type ClassificationResult = {
  keyword_type: KeywordType;
  search_intent: SearchIntent;
  is_question: boolean;
  is_local_intent: boolean;
  is_tool_intent: boolean;
  is_commercial_intent: boolean;
};

type ClassificationLexicon = {
  /** Parole che, in prima posizione, rendono la keyword una domanda. */
  question: string[];
  local: string[];
  tool: string[];
  commercial: string[];
  comparison: string[];
  transactional: string[];
  navigational: string[];
  product: string[];
  service: string[];
  content: string[];
};

/**
 * Lessici per lingua (T-704): ogni indizio è una parola intera o una sequenza contigua di parole
 * della forma normalizzata (T-702). Le lingue senza lessico ricevono la classificazione neutra.
 */
export const CLASSIFICATION_LEXICONS: Record<string, ClassificationLexicon> = {
  en: {
    question: ["how", "what", "when", "where", "why", "who", "which"],
    local: ["near me", "open now", "closest", "nearby", "local"],
    tool: ["tool", "tools", "generator", "checker", "calculator", "software"],
    commercial: ["best", "top", "review", "reviews", "pricing", "price", "prices", "cheap", "vs", "compare"],
    comparison: ["vs", "compare"],
    transactional: ["buy", "discount", "deal", "deals", "order", "coupon", "coupons", "book"],
    navigational: ["login", "official", "website", "app"],
    product: ["product", "products", "kit", "device", "devices", "accessory", "accessories"],
    service: ["service", "services", "agency", "consultant", "freelance"],
    content: ["guide", "ideas", "tips"],
  },
  it: {
    question: ["come", "cosa", "che", "quando", "dove", "perché", "perche", "chi", "quale", "quali", "quanto", "quanti"],
    local: ["vicino a me", "vicino", "nelle vicinanze", "aperto ora", "aperti ora"],
    tool: ["tool", "strumento", "strumenti", "generatore", "calcolatore", "calcolatrice", "software"],
    commercial: [
      "migliore",
      "migliori",
      "miglior",
      "top",
      "recensione",
      "recensioni",
      "prezzo",
      "prezzi",
      "economico",
      "economici",
      "costo",
      "opinioni",
      "classifica",
      "vs",
      "confronto",
    ],
    comparison: ["vs", "confronto"],
    transactional: [
      "compra",
      "comprare",
      "acquista",
      "acquistare",
      "acquisto",
      "ordina",
      "ordinare",
      "sconto",
      "sconti",
      "coupon",
      "offerta",
      "offerte",
      "prenota",
      "prenotare",
    ],
    navigational: ["login", "accedi", "sito ufficiale", "ufficiale", "app"],
    product: ["prodotto", "prodotti", "kit", "dispositivo", "dispositivi", "accessorio", "accessori"],
    service: ["servizio", "servizi", "agenzia", "consulente", "consulenza", "freelance"],
    content: ["guida", "idee", "consigli", "esempi", "tutorial"],
  },
};

const NEUTRAL_CLASSIFICATION: ClassificationResult = {
  keyword_type: "generic",
  search_intent: "mixed",
  is_question: false,
  is_local_intent: false,
  is_tool_intent: false,
  is_commercial_intent: false,
};

export function isClassificationSupported(languageCode: string): boolean {
  return Object.hasOwn(CLASSIFICATION_LEXICONS, languageCode);
}

export function classifyKeyword(keyword: string, languageCode: string): ClassificationResult {
  if (!isClassificationSupported(languageCode)) {
    return { ...NEUTRAL_CLASSIFICATION };
  }

  const lexicon = CLASSIFICATION_LEXICONS[languageCode];
  const tokens = normalizeKeyword(keyword).split(" ").filter(Boolean);
  const has = (hints: string[]) => hints.some((hint) => containsTokenSequence(tokens, hint.split(" ")));

  const isQuestion = keyword.trim().endsWith("?") || lexicon.question.includes(tokens[0] ?? "");
  const isLocalIntent = has(lexicon.local);
  const isToolIntent = has(lexicon.tool);
  const isCommercialIntent = has(lexicon.commercial);

  let keywordType: KeywordType = "generic";
  if (isQuestion) keywordType = "question";
  else if (has(lexicon.comparison)) keywordType = "comparison";
  else if (isLocalIntent) keywordType = "local";
  else if (isToolIntent) keywordType = "tool";
  else if (has(lexicon.service)) keywordType = "service";
  else if (has(lexicon.product)) keywordType = "product";
  else if (has(lexicon.content)) keywordType = "content_topic";

  let searchIntent: SearchIntent = "mixed";
  if (has(lexicon.transactional)) searchIntent = "transactional";
  else if (has(lexicon.navigational)) searchIntent = "navigational";
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
