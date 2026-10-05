import { normalizeDisplayText } from "@/lib/text/encoding";

/*
 * Regole di normalizzazione (T-702).
 *
 * normalizeKeyword(input), senza lingua:
 *   1. NFC e lowercase;
 *   2. apostrofo (U+0027, U+2018, U+2019) seguito da "s" a fine parola: tolto senza spazio
 *      (possessivo inglese); ogni altro apostrofo diventa spazio;
 *   3. "+" e "#" restano se attaccati in coda a lettere o cifre; "." resta tra due caratteri
 *      alfanumerici; "-" resta; ogni altro simbolo diventa spazio; spazi compattati.
 *
 * canonicalizeKeyword(input, languageCode) = normalizeKeyword, poi:
 *   4. segni combinanti tolti solo se la lettera base è latina, greca o cirillica (nessuna
 *      normalizzazione di compatibilità: i caratteri giapponesi restano quelli dell'input);
 *   5. solo per "en": "the" iniziale tolto; "a" e "an" mai.
 *
 * | input              | lingua | risultato canonico                  |
 * |--------------------|--------|-------------------------------------|
 * | l'hotel roma       | it     | l hotel roma                        |
 * | l’hotel roma       | it     | l hotel roma                        |
 * | lhotel roma        | it     | lhotel roma                         |
 * | women's shoes      | en     | womens shoes                        |
 * | c++ tutorial       | en     | c++ tutorial                        |
 * | c# tutorial        | en     | c# tutorial                         |
 * | node.js tutorial   | en     | node.js tutorial                    |
 * | a/b test           | en     | a b test                            |
 * | caffè              | it     | caffe                               |
 * | Ñandú              | es     | nandu                               |
 * | हिन्दी समाचार          | hi     | invariata (NFC)                     |
 * | ガジェット           | ja     | ガジェット (dakuten conservato)       |
 * | The best pizza     | en     | best pizza                          |
 * | vitamin a          | en     | vitamin a                           |
 * | the best pizza     | it     | the best pizza                      |
 *
 * normalizeKeyword("Caffè Latte") = "caffè latte": la forma normalizzata conserva gli accenti.
 */

const POSSESSIVE = /['‘’]s(?![\p{L}\p{N}])/gu;
const APOSTROPHE = /['‘’]/g;
// Gruppo 1: simboli che restano ("+"/"#" in coda a lettere o cifre, "." tra alfanumerici).
const SYMBOLS = /((?<=[\p{L}\p{N}\p{M}])[+#]+(?![\p{L}\p{N}])|(?<=[\p{L}\p{N}\p{M}])\.(?=[\p{L}\p{N}]))|[^\p{L}\p{N}\p{M}\s-]/gu;
const STRIPPABLE_MARKS = /([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu;
const ENGLISH_ARTICLE = /^the (?=\S)/;

export function normalizeKeyword(input: string): string {
  return normalizeDisplayText(input)
    .toLowerCase()
    .normalize("NFC")
    .replace(POSSESSIVE, "s")
    .replace(APOSTROPHE, " ")
    .replace(SYMBOLS, (_match, kept: string | undefined) => kept ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeKeyword(input: string, languageCode: string): string {
  const canonical = normalizeKeyword(input).normalize("NFD").replace(STRIPPABLE_MARKS, "$1").normalize("NFC");

  return languageCode === "en" ? canonical.replace(ENGLISH_ARTICLE, "") : canonical;
}

export function keywordCleanlinessScore(keyword: string): number {
  const length = keyword.length;
  const hasRepeatingSymbols = /(.)\1{3,}/.test(keyword);
  const symbolNoise = (keyword.match(/[^\p{L}\p{N}\p{M}\s]/gu) || []).length;

  let score = 1;
  if (length < 4 || length > 80) score -= 0.25;
  if (symbolNoise > 2) score -= 0.2;
  if (hasRepeatingSymbols) score -= 0.25;

  return Math.max(0.1, Math.min(score, 1));
}
