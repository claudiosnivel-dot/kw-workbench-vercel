import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import es419 from "@/messages/es-419.json";
import esES from "@/messages/es-ES.json";
import it_ from "@/messages/it.json";

type Catalog = { [key: string]: string | Catalog };

/** Chiave piatta (a.b.c) → messaggio. */
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

/** Nomi degli argomenti ICU di un messaggio, anche dentro plural, select e tag. */
function argumentNames(elements: MessageFormatElement[], names = new Set<string>()): Set<string> {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    if (element.type === TYPE.tag) {
      names.add(`<${element.value}>`);
      argumentNames(element.children, names);
      continue;
    }
    names.add(element.value);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) argumentNames(option.value, names);
    }
  }
  return names;
}

function sortedArguments(message: string): string[] {
  return [...argumentNames(parse(message))].sort();
}

/** Solo il testo letterale di un messaggio (anche dentro plural, select e tag), senza i nomi degli argomenti. */
function literalText(elements: MessageFormatElement[]): string {
  return elements
    .map((element) => {
      if (element.type === TYPE.literal) return element.value;
      if (element.type === TYPE.tag) return literalText(element.children);
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        return Object.values(element.options)
          .map((option) => literalText(option.value))
          .join(" ");
      }
      return " ";
    })
    .join("");
}

const italian = flatten(it_ as Catalog);
const english = flatten(en as Catalog);
// Parole italiane scritte senza accento nei testi originali (audit 2026-10-02).
const UNACCENTED_WORDS = /(?<!\p{L})(puo|piu|verra|restera|agira|gia)(?!\p{L})/giu;

// Namespace tradotti in spagnolo (T-4702; i moduli 48 e 49 aggiungono gli altri).
const SPANISH_NAMESPACES = [
  "common", "metadata", "nav", "projects", "jobs", "results", "project", "nextStep", "dashboard", "keywords", "plan", "errors", "errorPages",
];
const spain = flatten(esES as Catalog);
const latam = flatten(es419 as Catalog);
const italianInSpanishNamespaces = [...italian.keys()].filter((key) => SPANISH_NAMESPACES.includes(key.split(".")[0]));
// Guida di stile (docs/I18N-ES.md): tú, mai vosotros; «palabra clave» e non keyword, se non tra parentesi.
const FORBIDDEN_SPANISH = /vosotr|vuestr|keyword/iu;

describe("cataloghi it ed en", () => {
  // covers: AC-1302-1
  // covers: AC-1303-1
  it("hanno le stesse chiavi, nessun valore vuoto e gli stessi argomenti ICU", () => {
    const onlyItalian = [...italian.keys()].filter((key) => !english.has(key));
    const onlyEnglish = [...english.keys()].filter((key) => !italian.has(key));
    const empty = [...italian, ...english].filter(([, message]) => message.trim() === "").map(([key]) => key);
    const differentArguments = [...italian.keys()]
      .filter((key) => english.has(key))
      .filter((key) => sortedArguments(italian.get(key)!).join(",") !== sortedArguments(english.get(key)!).join(","));

    expect(italian.size).toBeGreaterThan(0);
    expect(onlyItalian).toEqual([]);
    expect(onlyEnglish).toEqual([]);
    expect(empty).toEqual([]);
    expect(differentArguments).toEqual([]);
  });

  // covers: AC-1302-2
  // covers: AC-1303-1
  it("l'italiano non contiene puo, piu, verra, restera, agira, gia senza accento", () => {
    const occurrences = [...italian].flatMap(([key, message]) =>
      [...message.matchAll(UNACCENTED_WORDS)].map((match) => `${key}: ${match[0]}`)
    );

    expect(occurrences).toEqual([]);
    // impacted-by: T-2604 (l'avviso di eliminazione della sezione non esiste più: l'accento si prova sull'avviso dei marchi)
    expect(italian.get("projects.brands.intro")).toMatch(/(?<!\p{L})già(?!\p{L})/u);
  });
});

describe("cataloghi es-ES ed es-419", () => {
  // covers: AC-4702-2
  it("es-ES ha tutte le chiavi italiane dei namespace tradotti, senza valori vuoti e con gli stessi argomenti ICU", () => {
    const missing = italianInSpanishNamespaces.filter((key) => !spain.has(key));
    const unknown = [...spain.keys()].filter((key) => !italian.has(key));
    const empty = [...spain, ...latam].filter(([, message]) => message.trim() === "").map(([key]) => key);
    const differentArguments = italianInSpanishNamespaces
      .filter((key) => spain.has(key))
      .filter((key) => sortedArguments(italian.get(key)!).join(",") !== sortedArguments(spain.get(key)!).join(","));

    expect(italianInSpanishNamespaces.length).toBeGreaterThan(500);
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect(empty).toEqual([]);
    expect(differentArguments).toEqual([]);
  });

  // covers: AC-4702-2
  it("es-419 ha solo chiavi di es-ES, con gli stessi argomenti e valori diversi", () => {
    const unknown = [...latam.keys()].filter((key) => !spain.has(key));
    const differentArguments = [...latam.keys()]
      .filter((key) => spain.has(key))
      .filter((key) => sortedArguments(latam.get(key)!).join(",") !== sortedArguments(spain.get(key)!).join(","));
    const sameAsSpain = [...latam].filter(([key, message]) => spain.get(key) === message).map(([key]) => key);

    expect(latam.size).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
    expect(differentArguments).toEqual([]);
    expect(sameAsSpain).toEqual([]);
  });

  // covers: AC-4702-2
  it("nessun valore spagnolo contiene vosotros, vuestro o keyword fuori dalle parentesi", () => {
    const occurrences = [...spain, ...latam]
      .filter(([, message]) => FORBIDDEN_SPANISH.test(literalText(parse(message)).replace(/\([^)]*\)/gu, "")))
      .map(([key]) => key);

    expect(occurrences).toEqual([]);
    // Il controllo vede il testo, non i nomi degli argomenti ({keyword}), e ammette le parentesi.
    expect(spain.get("keywords.row.keep")).toContain("{keyword}");
    expect(spain.get("errors.PLANNER_KEYWORD_COLUMN_MISSING")).toContain("(Keyword)");
    expect(FORBIDDEN_SPANISH.test(literalText(parse("Añadir la keyword")))).toBe(true);
  });
});
