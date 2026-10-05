// Gate di T-703 (AC-703-1…AC-703-4): filtro brand per sequenze di parole intere sulla forma
// canonica di T-702.
import { describe, expect, it } from "vitest";
import { evaluateBrandStatus, prepareBlacklist } from "@/lib/modules/brand-filter";

function evaluate(keyword: string, brands: string[], excludeBrands: boolean, languageCode: string) {
  return evaluateBrandStatus({
    keyword,
    blacklist: prepareBlacklist(brands, languageCode),
    excludeBrands,
    languageCode,
  });
}

describe("filtro brand a parola intera", () => {
  // covers: AC-703-1
  it("'hp' non esclude 'php tutorial' ed esclude 'stampante hp'", () => {
    const php = evaluate("php tutorial", ["hp"], true, "it");
    const printer = evaluate("stampante hp", ["hp"], true, "it");

    expect(php.brand_status).toBe("allowed");
    expect(php.matchedBrand).toBeUndefined();
    expect(printer.brand_status).toBe("excluded");
    expect(printer.brand_reason).toBe("Matched blacklist brand: hp");
  });

  // covers: AC-703-2
  it("'apple' non tocca 'pineapple juice' e manda in revisione 'apple watch'", () => {
    const juice = evaluate("pineapple juice", ["apple"], false, "en");
    const watch = evaluate("apple watch", ["apple"], false, "en");

    expect(juice.brand_status).toBe("allowed");
    expect(watch.brand_status).toBe("review");
    expect(watch.matchedBrand).toBe("apple");
  });

  // covers: AC-703-3
  it("accenti e apostrofo tipografico non eludono il brand", () => {
    const brands = ["nestlé", "l'oréal"];
    const cereals = evaluate("nestle cereali", brands, true, "it");
    const shampoo = evaluate("l’oreal shampoo", brands, true, "it");

    expect(cereals.brand_status).toBe("excluded");
    expect(cereals.matchedBrand).toBe("nestlé");
    expect(shampoo.brand_status).toBe("excluded");
    expect(shampoo.matchedBrand).toBe("l'oréal");
  });

  // covers: AC-703-4
  it("'coca-cola' esclude la forma con spazio e con trattino ma non 'cola di pesce'", () => {
    expect(evaluate("coca cola zero", ["coca-cola"], true, "it").brand_status).toBe("excluded");
    expect(evaluate("coca-cola zero", ["coca-cola"], true, "it").brand_status).toBe("excluded");
    expect(evaluate("cola di pesce", ["coca-cola"], true, "it").brand_status).toBe("allowed");
  });
});
