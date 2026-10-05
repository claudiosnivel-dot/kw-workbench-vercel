import { BrandStatus } from "@/lib/generated/prisma/enums";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

/*
 * Filtro brand (T-703): keyword e brand si confrontano come sequenze di parole intere sulla forma
 * canonica di T-702 (stessa lingua), divise su spazi e trattini; il brand deve comparire come
 * sottosequenza contigua dei token della keyword ('hp' non trova 'php', 'coca-cola' trova
 * 'coca cola'). Limite noto: un'elisione italiana che coincide con un brand produce un match
 * (brand 'dell' e keyword «hotel dell'aquila»).
 */

export type BrandFilterResult = {
  brand_status: BrandStatus;
  brand_reason?: string;
  matchedBrand?: string;
};

export type PreparedBrand = {
  brand: string;
  tokens: string[];
};

function tokenize(input: string, languageCode: string): string[] {
  return canonicalizeKeyword(input, languageCode).split(/[\s-]+/).filter(Boolean);
}

function containsSequence(tokens: string[], sequence: string[]): boolean {
  for (let start = 0; start + sequence.length <= tokens.length; start += 1) {
    if (sequence.every((token, offset) => tokens[start + offset] === token)) {
      return true;
    }
  }
  return false;
}

/** Converte una volta per run ogni brand in sequenza di token; brand vuoti ignorati. */
export function prepareBlacklist(brands: string[], languageCode: string): PreparedBrand[] {
  return brands
    .map((brand) => ({ brand: brand.trim(), tokens: tokenize(brand, languageCode) }))
    .filter((entry) => entry.brand && entry.tokens.length > 0);
}

export function evaluateBrandStatus(params: {
  keyword: string;
  blacklist: PreparedBrand[];
  excludeBrands: boolean;
  languageCode: string;
}): BrandFilterResult {
  const tokens = tokenize(params.keyword, params.languageCode);

  for (const entry of params.blacklist) {
    if (containsSequence(tokens, entry.tokens)) {
      return {
        brand_status: params.excludeBrands ? "excluded" : "review",
        brand_reason: `Matched blacklist brand: ${entry.brand}`,
        matchedBrand: entry.brand,
      };
    }
  }

  return { brand_status: "allowed" };
}
