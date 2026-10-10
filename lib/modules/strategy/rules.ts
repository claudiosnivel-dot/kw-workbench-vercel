import { z } from "zod";
import { KeywordType, SearchIntent } from "@/lib/generated/prisma/enums";
import type { StrategyRuleLimits, StrategyRules } from "@/lib/modules/strategy/types";

/**
 * Regole predefinite della modalità automatica (T-1901), approvate dall'utente il 2026-10-09: uno spoke nasce con
 * almeno 2 keyword o 100 ricerche al mese, al massimo 12 spoke per hub, una domanda diventa uno spoke da 200 ricerche
 * in su e altrimenti va nella FAQ della pagina più vicina.
 */
export const DEFAULT_RULES: StrategyRules = {
  minKeywordsPerSpoke: 2,
  minSpokeVolume: 100,
  maxSpokesPerHub: 12,
  questionSpokeVolume: 200,
  questionsAs: "faq",
};

/** Limiti ammessi per le regole della modalità esperta: oltre, 400 VALIDATION_ERROR. */
export const RULE_LIMITS = {
  minKeywordsPerSpoke: { min: 1, max: 20 },
  minSpokeVolume: { min: 0, max: 1_000_000 },
  maxSpokesPerHub: { min: 1, max: 30 },
  questionSpokeVolume: { min: 0, max: 1_000_000 },
} as const satisfies StrategyRuleLimits;

const intIn = (limits: { min: number; max: number }) => z.number().int().min(limits.min).max(limits.max);

export const strategyRulesSchema = z
  .object({
    minKeywordsPerSpoke: intIn(RULE_LIMITS.minKeywordsPerSpoke),
    minSpokeVolume: intIn(RULE_LIMITS.minSpokeVolume),
    maxSpokesPerHub: intIn(RULE_LIMITS.maxSpokesPerHub),
    questionSpokeVolume: intIn(RULE_LIMITS.questionSpokeVolume),
    questionsAs: z.enum(["faq", "spokes"]),
  })
  .strict();

// Massimo della colonna Int di Postgres per il volume minimo (CWE-190).
const INT4_MAX = 2_147_483_647;

/** Stati di revisione del perimetro: solo approvate, oppure approvate e da rivedere (le rifiutate mai). */
export const REVIEW_SCOPES = ["approved", "approved_pending"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

/**
 * Impostazioni della modalità esperta (T-1903): perimetro (progetto o una sezione, stati di revisione, volume minimo,
 * intento e tipo, con le stesse clausole dei filtri dei risultati) e regole; le regole mancanti prendono il valore
 * predefinito, una regola fuori dai limiti è un errore.
 */
export const expertSettingsSchema = z
  .object({
    sectionId: z.string().trim().min(1).max(64).nullable().optional(),
    reviewStatus: z.enum(REVIEW_SCOPES).optional(),
    minVolume: z.number().int().min(0).max(INT4_MAX).nullable().optional(),
    searchIntent: z.enum(SearchIntent).nullable().optional(),
    keywordType: z.enum(KeywordType).nullable().optional(),
    rules: strategyRulesSchema.partial().optional(),
  })
  .strict();

/** Impostazioni salvate con la strategia: perimetro e regole effettive, riportati nell'appendice del PDF. */
export type StrategySettings = {
  sectionId: string | null;
  reviewStatus: ReviewScope;
  minVolume: number | null;
  searchIntent: SearchIntent | null;
  keywordType: KeywordType | null;
  rules: StrategyRules;
};

/** Perimetro e regole della modalità automatica: tutto il progetto, approvate e da rivedere, regole predefinite. */
export const AUTO_SETTINGS: StrategySettings = {
  sectionId: null,
  reviewStatus: "approved_pending",
  minVolume: null,
  searchIntent: null,
  keywordType: null,
  rules: DEFAULT_RULES,
};

/** Impostazioni effettive della modalità esperta da un input già validato da expertSettingsSchema. */
export function resolveExpertSettings(input: z.output<typeof expertSettingsSchema>): StrategySettings {
  return {
    sectionId: input.sectionId ?? null,
    reviewStatus: input.reviewStatus ?? "approved_pending",
    minVolume: input.minVolume ?? null,
    searchIntent: input.searchIntent ?? null,
    keywordType: input.keywordType ?? null,
    rules: { ...DEFAULT_RULES, ...input.rules },
  };
}
