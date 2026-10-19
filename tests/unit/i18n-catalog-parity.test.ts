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

// Namespace tradotti in spagnolo: percorso di lavoro (T-4702), strategia, export, impostazioni e integrazioni (T-4801),
// accesso, account e fatturazione (T-4802); il modulo 49 aggiunge gli altri (T-4901).
const WORK_NAMESPACES = [
  "common", "metadata", "nav", "projects", "jobs", "results", "project", "nextStep", "dashboard", "keywords", "plan", "errors", "errorPages",
];
const STRATEGY_EXPORT_NAMESPACES = ["strategy", "export", "exportDialog", "settings", "integrations"];
const ACCOUNT_NAMESPACES = ["auth", "account", "billing", "footer"];
const SPANISH_NAMESPACES = [...WORK_NAMESPACES, ...STRATEGY_EXPORT_NAMESPACES, ...ACCOUNT_NAMESPACES];
const spain = flatten(esES as Catalog);
const latam = flatten(es419 as Catalog);
// es-419 letto come lo legge l'app: es-ES con le differenze sopra (lib/i18n/catalogs.ts).
const latamLayered = new Map([...spain, ...latam]);
const italianIn = (namespaces: string[]) => [...italian.keys()].filter((key) => namespaces.includes(key.split(".")[0]));
const italianInSpanishNamespaces = italianIn(SPANISH_NAMESPACES);
// Guida di stile (docs/I18N-ES.md): tú, mai vosotros; «palabra clave» e non keyword, se non tra parentesi.
const FORBIDDEN_SPANISH = /vosotr|vuestr|keyword/iu;
const isForbidden = (message: string) => FORBIDDEN_SPANISH.test(literalText(parse(message)).replace(/\([^)]*\)/gu, ""));

/** Controllo di parità di T-4702 sui soli namespace dati, per es-ES e per es-419 letto a livelli. */
function parityProblems(namespaces: string[]) {
  const keys = italianIn(namespaces);
  const problems = (catalog: Map<string, string>) => ({
    missing: keys.filter((key) => !catalog.has(key)),
    empty: keys.filter((key) => catalog.get(key)?.trim() === ""),
    differentArguments: keys
      .filter((key) => catalog.has(key))
      .filter((key) => sortedArguments(italian.get(key)!).join(",") !== sortedArguments(catalog.get(key)!).join(",")),
    forbidden: keys.filter((key) => catalog.has(key) && isForbidden(catalog.get(key)!)),
  });
  return { keys: keys.length, spain: problems(spain), latam: problems(latamLayered) };
}

const NO_PROBLEMS = { missing: [], empty: [], differentArguments: [], forbidden: [] };

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
    const occurrences = [...spain, ...latam].filter(([, message]) => isForbidden(message)).map(([key]) => key);

    expect(occurrences).toEqual([]);
    // Il controllo vede il testo, non i nomi degli argomenti ({keyword}), e ammette le parentesi.
    expect(spain.get("keywords.row.keep")).toContain("{keyword}");
    expect(spain.get("errors.PLANNER_KEYWORD_COLUMN_MISSING")).toContain("(Keyword)");
    expect(isForbidden("Añadir la keyword")).toBe(true);
  });

  // covers: AC-4801-2
  it("strategia, export, impostazioni e integrazioni sono complete in es-ES ed es-419, con gli argomenti italiani", () => {
    const result = parityProblems(STRATEGY_EXPORT_NAMESPACES);

    expect(result.keys).toBeGreaterThan(250);
    expect(result.spain).toEqual(NO_PROBLEMS);
    expect(result.latam).toEqual(NO_PROBLEMS);
  });

  // covers: AC-4802-2
  it("accesso, account, fatturazione e footer sono completi in es-ES ed es-419, con gli argomenti italiani", () => {
    const result = parityProblems(ACCOUNT_NAMESPACES);

    expect(result.keys).toBeGreaterThan(150);
    expect(result.spain).toEqual(NO_PROBLEMS);
    expect(result.latam).toEqual(NO_PROBLEMS);
  });

  // covers: AC-4901-2
  it("tutti i namespace dell'italiano sono completi in es-ES ed es-419, con gli argomenti italiani e senza parole vietate", () => {
    const result = parityProblems(Object.keys(it_));

    expect(result.keys).toBe(italian.size);
    expect(result.keys).toBeGreaterThan(1300);
    expect(result.spain).toEqual(NO_PROBLEMS);
    expect(result.latam).toEqual(NO_PROBLEMS);
  });
});
