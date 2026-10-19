import { containsTokenSequence } from "@/lib/modules/normalization";
import type { ModifierCategory } from "@/lib/modules/strategy/types";

/*
 * Parole vuote e modificatori per italiano e inglese (T-1901) e spagnolo (T-5101, D-47). Modulo puro. Le parole sono
 * nella forma canonica di T-702 (minuscole, senza accenti); il confronto con le keyword avviene sulle radici di
 * wordStem, quindi singolare e plurale coincidono. Un modificatore di più parole si cerca come sequenza contigua nei token della keyword. Le lingue
 * senza dizionario non hanno parole vuote né modificatori: il raggruppamento usa solo le parole condivise.
 */

type LanguageLexicon = {
  /** Articoli, preposizioni (anche articolate) e congiunzioni che non distinguono un argomento. */
  stopwords: readonly string[];
  modifiers: Record<ModifierCategory, readonly string[]>;
};

const LEXICONS: Record<string, LanguageLexicon> = {
  it: {
    stopwords: [
      "il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una", "di", "d", "a", "da", "in", "con", "su", "per",
      "tra", "fra", "del", "dello", "della", "dei", "degli", "delle", "al", "allo", "alla", "ai", "agli", "alle",
      "dal", "dallo", "dalla", "dai", "dagli", "dalle", "nel", "nello", "nella", "nei", "negli", "nelle", "sul",
      "sullo", "sulla", "sui", "sugli", "sulle", "col", "coi", "e", "ed", "o", "od",
    ],
    modifiers: {
      local: ["vicino a me", "vicino", "vicini", "nelle vicinanze", "zona"],
      tool: ["calcolatore", "calcolatrice", "calcola", "generatore", "simulatore", "convertitore", "online", "gratis", "app"],
      comparison: [
        "migliori", "migliore", "miglior", "recensioni", "recensione", "opinioni", "opinione", "vs", "contro",
        "classifica", "confronto", "top", "alternative", "alternativa",
      ],
      transactional: [
        "prezzo", "prezzi", "costo", "costi", "offerte", "offerta", "comprare", "compra", "acquistare", "acquista",
        "acquisto", "economico", "economici", "economica", "economiche", "sconto", "sconti", "saldi", "outlet",
      ],
      informational: [
        "come", "cosa", "cos", "perche", "quale", "quali", "quando", "dove", "chi", "quanto", "quanti", "quanta",
        "quante", "guida", "significato", "tutorial", "consigli", "esempi", "idee",
      ],
    },
  },
  en: {
    stopwords: ["the", "a", "an", "of", "for", "to", "in", "on", "at", "by", "with", "from", "and", "or", "into", "about"],
    modifiers: {
      local: ["near me", "nearby", "near", "local"],
      tool: ["calculator", "generator", "online", "free", "checker", "tool", "converter", "template"],
      comparison: ["best", "review", "reviews", "vs", "versus", "top", "compare", "comparison", "alternative", "alternatives", "rated"],
      transactional: ["price", "prices", "cost", "cheap", "buy", "deal", "deals", "discount", "sale", "coupon", "offer", "shop"],
      informational: ["how", "what", "why", "which", "when", "where", "who", "guide", "meaning", "tutorial", "tips", "ideas"],
    },
  },
  // «para» resta solo una parola vuota, come «per» in italiano: le parole vuote si tolgono prima dei modificatori.
  es: {
    stopwords: [
      "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "de", "del", "en", "para", "por", "con", "a", "al", "y",
      "e", "o", "u",
    ],
    modifiers: {
      local: ["cerca de mi", "cerca", "cercano", "zona"],
      tool: [
        "calculadora", "calcular", "generador", "simulador", "conversor", "convertidor", "online", "en linea", "gratis",
        "gratuito", "app", "plantilla",
      ],
      comparison: [
        "mejor", "mejores", "opiniones", "opinion", "resenas", "resena", "vs", "versus", "comparativa", "comparacion", "ranking",
        "top", "alternativas", "alternativa",
      ],
      transactional: [
        "precio", "precios", "costo", "coste", "barato", "economico", "oferta", "ofertas", "comprar", "compra", "venta",
        "alquiler", "alquilar", "descuento", "descuentos", "rebajas", "outlet",
      ],
      informational: [
        "como", "que", "cual", "cuales", "cuando", "donde", "quien", "cuanto", "cuantos", "guia", "significado", "tutorial",
        "consejos", "ejemplos", "ideas",
      ],
    },
  },
};

const MIN_STEM_LENGTH = 4;
const FINAL_VOWEL = /[aeiou]$/;
const ENGLISH_ES_PLURAL = /(?:s|x|z|ch|sh)es$/;

/** Spagnolo: senza la s finale, poi senza la vocale finale se restano almeno 4 lettere (ojos → ojo come ojo). */
function spanishStem(word: string): string {
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  return [...singular].length >= MIN_STEM_LENGTH ? singular.replace(FINAL_VOWEL, "") : singular;
}

/**
 * Radice di una parola per l'equivalenza di singolare e plurale, solo per parole di almeno 4 lettere: in italiano
 * senza la vocale finale (scarpa, scarpe → scarp), in inglese senza la s o la es finale (shoes → shoe, boxes → box,
 * glass resta glass), in spagnolo senza la s e poi la vocale finale (camas, cama → cam; hospitales → hospital;
 * barato, baratas → barat). Per le altre lingue la parola resta com'è.
 */
export function wordStem(word: string, language: string): string {
  if ([...word].length < MIN_STEM_LENGTH) {
    return word;
  }
  if (language === "it") {
    return word.replace(FINAL_VOWEL, "");
  }
  if (language === "es") {
    return spanishStem(word);
  }
  if (language === "en") {
    if (word.endsWith("ss")) return word;
    if (ENGLISH_ES_PLURAL.test(word)) return word.slice(0, -2);
    return word.endsWith("s") ? word.slice(0, -1) : word;
  }
  return word;
}

export function isStopword(token: string, language: string): boolean {
  return LEXICONS[language]?.stopwords.includes(token) ?? false;
}

type CompiledModifiers = { single: Map<string, ModifierCategory>; sequences: { tokens: string[]; category: ModifierCategory }[] };

const compiled = new Map<string, CompiledModifiers | null>();

function modifiersOf(language: string): CompiledModifiers | null {
  if (!compiled.has(language)) {
    const lexicon = LEXICONS[language];
    if (!lexicon) {
      compiled.set(language, null);
    } else {
      const single = new Map<string, ModifierCategory>();
      const sequences: CompiledModifiers["sequences"] = [];
      for (const [category, words] of Object.entries(lexicon.modifiers) as [ModifierCategory, readonly string[]][]) {
        for (const entry of words) {
          const tokens = entry.split(" ");
          if (tokens.length > 1) {
            sequences.push({ tokens, category });
          } else if (!single.has(wordStem(entry, language))) {
            single.set(wordStem(entry, language), category);
          }
        }
      }
      compiled.set(language, { single, sequences });
    }
  }
  return compiled.get(language) ?? null;
}

/** Categoria del modificatore di una radice, o null (sempre null per le lingue senza dizionario). */
export function modifierCategoryOfStem(stem: string, language: string): ModifierCategory | null {
  return modifiersOf(language)?.single.get(stem) ?? null;
}

/**
 * Categorie dei modificatori di più parole (vicino a me, near me, cerca de mi) presenti come sequenza contigua nei token
 * della keyword. Vuoto per le lingue senza dizionario.
 */
export function sequenceModifierCategories(tokens: string[], language: string): Set<ModifierCategory> {
  const found = new Set<ModifierCategory>();
  for (const { tokens: sequence, category } of modifiersOf(language)?.sequences ?? []) {
    if (containsTokenSequence(tokens, sequence)) {
      found.add(category);
    }
  }
  return found;
}
