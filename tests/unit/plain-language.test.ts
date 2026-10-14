// Gate di T-2604 (AC-2604-1): nei testi che vede il cliente niente gergo interno (seed, job, override, sezione, provider,
// scoring). Le espressioni si applicano al testo dei messaggi: i nomi degli argomenti ICU (per esempio {seed} nei
// motivi delle pagine del piano, legato ai parametri salvati con le strategie) non si vedono a schermo.
import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";

type Catalog = { [key: string]: string | Catalog };

// Namespace fuori dal perimetro di T-2604: pannello di amministrazione, pagine legali e pubbliche, email.
const EXCLUDED_NAMESPACES = new Set(["admin", "legal", "marketing", "emails"]);
const ITALIAN_JARGON = /\b(seed|job|override|sezion[ei]|provider|scoring)\b/i;
const ENGLISH_JARGON = /\b(seeds?|jobs?|overrides?|sections?|providers?|scoring)\b/i;

function flatten(catalog: Catalog, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(path, value);
    } else {
      for (const [nested, message] of flatten(value, path)) entries.set(nested, message);
    }
  }
  return entries;
}

/** Testo visibile del messaggio: le parti letterali, anche dentro plural, select e tag. */
function visibleText(elements: MessageFormatElement[]): string {
  return elements
    .map((element) => {
      if (element.type === TYPE.literal) return element.value;
      if (element.type === TYPE.tag) return visibleText(element.children);
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        return Object.values(element.options)
          .map((option) => visibleText(option.value))
          .join(" ");
      }
      return " ";
    })
    .join("");
}

function jargonIn(catalog: Catalog, pattern: RegExp): string[] {
  return [...flatten(catalog)]
    .filter(([key]) => !EXCLUDED_NAMESPACES.has(key.split(".")[0]))
    .filter(([, message]) => pattern.test(visibleText(parse(message))))
    .map(([key, message]) => `${key}: ${message}`);
}

describe("parole semplici nei cataloghi del cliente", () => {
  // covers: AC-2604-1
  it("le espressioni del gergo non trovano valori fuori da admin, legal, marketing ed emails e le chiavi coincidono", () => {
    const italianKeys = [...flatten(it_ as Catalog).keys()].sort();
    const englishKeys = [...flatten(en as Catalog).keys()].sort();

    expect(jargonIn(it_ as Catalog, ITALIAN_JARGON)).toEqual([]);
    expect(jargonIn(en as Catalog, ENGLISH_JARGON)).toEqual([]);
    expect(englishKeys).toEqual(italianKeys);
    expect(Object.keys(it_)).not.toContain("sections");
    expect(Object.keys(it_)).not.toContain("onboarding");
  });
});
