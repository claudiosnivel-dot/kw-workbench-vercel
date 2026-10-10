// Gate di T-1902 (AC-1902-1…5): H1 e H2 a modelli fissi senza parole ripetute, H2 per gruppo di varianti con le
// domande, pilastro con gli spoke in ordine di priorità e la FAQ in chiusura, titoli stabili, lingue senza modelli e
// cataloghi allineati con un motivo per ogni reason_code.
import { parse } from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { buildPageTitles, type TitleContext, type TitleKeyword, type TitlePage } from "@/lib/modules/strategy/titles";
import { STRATEGY_REASON_CODES } from "@/lib/modules/strategy/types";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";

type Catalog = { [key: string]: string | Catalog };

function italianContext(): TitleContext {
  const t = createTranslator({ locale: "it", messages: it_, namespace: "strategy" });
  return { language: "it", year: 2026, translate: (key, values) => t(key as never, values as never) };
}

function kw(keyword: string, language = "it", isQuestion = false): TitleKeyword {
  return { keyword, canonical: canonicalizeKeyword(keyword, language), isQuestion };
}

function occurrences(text: string, word: string): number {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token === word).length;
}

function flatten(catalog: Catalog, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") entries.set(path, value);
    else for (const [nested, message] of flatten(value, path)) entries.set(nested, message);
  }
  return entries;
}

describe("buildPageTitles", () => {
  // covers: AC-1902-1
  it("non ripete nell'H1 la parola del modello già presente nella keyword", () => {
    const guide: TitlePage = { kind: "SPOKE", contentType: "guide", main: kw("guida scarpe running"), secondary: [] };
    const tool: TitlePage = { kind: "SPOKE", contentType: "tool", main: kw("calcolatore passo online"), secondary: [] };

    const guideH1 = buildPageTitles(guide, italianContext()).h1;
    const toolH1 = buildPageTitles(tool, italianContext()).h1;

    expect(occurrences(guideH1, "guida")).toBe(1);
    expect(occurrences(toolH1, "online")).toBe(1);
    expect(guideH1.startsWith("Guida scarpe running")).toBe(true);
    expect(toolH1.startsWith("Calcolatore passo online")).toBe(true);
  });

  // covers: AC-1902-2
  it("uno spoke ha un H2 per gruppo di varianti, la domanda con il punto interrogativo e al massimo 12 H2", () => {
    const others = [
      "donna", "uomo", "asics", "nike", "trail", "bambino", "invernali", "estive", "leggere", "ammortizzate",
      "pronazione", "maratona", "neutre", "larghe",
    ].map((word) => kw(`scarpe running ${word}`));
    const page: TitlePage = {
      kind: "SPOKE",
      contentType: "product_category",
      main: kw("scarpe running offerte"),
      secondary: [kw("come allacciare le scarpe running", "it", true), kw("scarpe running prezzo"), kw("scarpe running prezzi"), ...others],
    };

    const { h2 } = buildPageTitles(page, italianContext());

    expect(h2).toContain("Come allacciare le scarpe running?");
    expect(h2.filter((heading) => /^Scarpe running prezz/.test(heading))).toEqual(["Scarpe running prezzo"]);
    expect(h2).toHaveLength(12);
  });

  // covers: AC-1902-3
  it("la pilastro ha prima gli spoke in ordine di priorità e chiude con le domande frequenti", () => {
    const page: TitlePage = {
      kind: "HUB",
      contentType: "guide",
      main: kw("scarpe running"),
      secondary: [
        kw("scarpe da running"),
        kw("come allacciare le scarpe running", "it", true),
        kw("quanto durano le scarpe running", "it", true),
      ],
      spokeMains: [kw("migliori scarpe running"), kw("scarpe running offerte"), kw("scarpe running donna")],
    };

    const { h2 } = buildPageTitles(page, italianContext());

    expect(h2.slice(0, 3)).toEqual(["Migliori scarpe running", "Scarpe running offerte", "Scarpe running donna"]);
    expect(h2.at(-1)).toBe(it_.strategy.fixedH2.faq);
  });

  // covers: AC-1902-4
  it("la stessa pagina ha sempre lo stesso H1 e una lingua senza modelli usa la keyword con l'iniziale maiuscola", () => {
    const page: TitlePage = { kind: "HUB", contentType: "guide", main: kw("scarpe running"), secondary: [] };
    const german: TitlePage = { kind: "HUB", contentType: "guide", main: kw("laufschuhe test", "de"), secondary: [] };

    expect(buildPageTitles(page, italianContext()).h1).toBe(buildPageTitles(page, italianContext()).h1);
    expect(buildPageTitles(german, { ...italianContext(), language: "de" }).h1).toBe("Laufschuhe test");
  });

  // covers: AC-1902-5
  it("i cataloghi hanno le stesse chiavi sotto strategy, un motivo per ogni reason_code e messaggi ICU validi", () => {
    const italian = flatten((it_ as Catalog).strategy as Catalog);
    const english = flatten((en as Catalog).strategy as Catalog);

    expect([...italian.keys()].sort()).toEqual([...english.keys()].sort());
    for (const code of STRATEGY_REASON_CODES) {
      expect(italian.has(`reasons.${code}`), code).toBe(true);
    }
    for (const [key, message] of [...italian, ...english]) {
      expect(() => parse(message), key).not.toThrow();
    }
  });
});
