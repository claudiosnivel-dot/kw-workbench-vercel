import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
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

const italian = flatten(it_ as Catalog);
const english = flatten(en as Catalog);
// Parole italiane scritte senza accento nei testi originali (audit 2026-10-02).
const UNACCENTED_WORDS = /(?<!\p{L})(puo|piu|verra|restera|agira|gia)(?!\p{L})/giu;

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
    expect(italian.get("sections.deleteWarning")).toMatch(/(?<!\p{L})resterà(?!\p{L})/u);
  });
});
