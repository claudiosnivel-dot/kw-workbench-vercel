// Gate di T-702 (AC-702-1…AC-702-4): normalizzazione e forma canonica con regole esplicite,
// segni combinanti tolti solo per le scritture latina, greca e cirillica, articolo solo in inglese.
import { describe, expect, it } from "vitest";
import { canonicalizeKeyword, normalizeKeyword } from "@/lib/modules/normalization";

function codePoints(value: string): number[] {
  return Array.from(value).map((char) => char.codePointAt(0) ?? 0);
}

describe("apostrofi e possessivo inglese", () => {
  // covers: AC-702-1
  it("l'apostrofo diventa spazio, il possessivo perde l'apostrofo, gli accenti restano nella forma normalizzata", () => {
    for (const keyword of ["l'hotel roma", "l’hotel roma"]) {
      expect(canonicalizeKeyword(keyword, "it")).toBe("l hotel roma");
      expect(normalizeKeyword(keyword)).toBe("l hotel roma");
    }
    expect(canonicalizeKeyword("lhotel roma", "it")).toBe("lhotel roma");
    expect(normalizeKeyword("lhotel roma")).toBe("lhotel roma");
    expect(canonicalizeKeyword("women's shoes", "en")).toBe("womens shoes");
    expect(normalizeKeyword("women's shoes")).toBe("womens shoes");
    expect(normalizeKeyword("Caffè Latte")).toBe("caffè latte");
  });
});

describe("simboli con significato", () => {
  // covers: AC-702-2
  it("c++, c# e c restano distinte, il punto tra alfanumerici resta, la barra diventa spazio", () => {
    const forms = ["c++ tutorial", "c# tutorial", "c tutorial"].map((keyword) => canonicalizeKeyword(keyword, "en"));

    expect(forms).toEqual(["c++ tutorial", "c# tutorial", "c tutorial"]);
    expect(new Set(forms).size).toBe(3);
    expect(canonicalizeKeyword("node.js tutorial", "en")).toBe("node.js tutorial");
    expect(canonicalizeKeyword("node js tutorial", "en")).toBe("node js tutorial");
    expect(canonicalizeKeyword("a/b test", "en")).toBe("a b test");
  });
});

describe("segni combinanti per scrittura", () => {
  // covers: AC-702-3
  it("toglie gli accenti latini e conserva devanagari, thai e dakuten giapponese", () => {
    expect(canonicalizeKeyword("caffè", "it")).toBe("caffe");
    expect(canonicalizeKeyword("caffe", "it")).toBe("caffe");
    expect(canonicalizeKeyword("Ñandú", "es")).toBe("nandu");
    const hindi = "हिन्दी समाचार";
    const thai = "สวัสดี";
    expect(codePoints(canonicalizeKeyword(hindi, "hi"))).toEqual(codePoints(hindi.normalize("NFC")));
    expect(codePoints(canonicalizeKeyword(thai, "th"))).toEqual(codePoints(thai.normalize("NFC")));
    expect(canonicalizeKeyword("ガジェット", "ja")).toBe("ガジェット");
    expect(canonicalizeKeyword("カジェット", "ja")).toBe("カジェット");
    expect(canonicalizeKeyword("ガジェット", "ja")).not.toBe(canonicalizeKeyword("カジェット", "ja"));
  });
});

describe("articolo iniziale solo in inglese", () => {
  // covers: AC-702-4
  it("toglie solo 'the' iniziale in inglese, mai 'a' e 'an'", () => {
    expect(canonicalizeKeyword("The best pizza", "en")).toBe("best pizza");
    expect(canonicalizeKeyword("the best pizza", "en")).toBe("best pizza");
    expect(canonicalizeKeyword("vitamin a", "en")).toBe("vitamin a");
    expect(canonicalizeKeyword("an apple a day", "en")).toBe("an apple a day");
    expect(canonicalizeKeyword("the best pizza", "it")).toBe("the best pizza");
  });
});
