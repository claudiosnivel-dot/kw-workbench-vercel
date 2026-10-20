// Gate di T-4301 (AC-4301-1, AC-4301-2): l'analisi del testo di un blocco trova i tratti tipici dei testi generati e i
// dati da verificare con la loro posizione, e la soglia dei tratti AI (almeno 2 ogni 300 parole, minimo 2). In più le
// regole inglesi e spagnole, i tratti di ogni lingua (emoji, domande retoriche e aperture ripetute), i segnaposto delle
// tre lingue, un dato trovato una volta sola e il tempo su testi di 20.000 caratteri (CWE-1333).
import { describe, expect, it } from "vitest";
import { markdownWords } from "@/lib/articles/markdown-sanitizer";
import { analyzeStyle } from "@/lib/articles/style-check";

/** Corrispondenze come [tipo, testo trovato], con il testo ritagliato da start ed end. */
function found(text: string, language: string): [string, string][] {
  return analyzeStyle(text, language).matches.map((match) => [match.kind, text.slice(match.start, match.end)]);
}

/** Blocco di esattamente 300 parole: le frasi indicate, poi una frase lunga di riempimento. */
function block300(opening: string): string {
  const filler = Array.from({ length: 300 - markdownWords(opening).length }, () => "letto").join(" ");
  const text = `${opening} ${filler}.`;
  expect(markdownWords(text)).toHaveLength(300);
  return text;
}

describe("tratti AI e dati da verificare", () => {
  // covers: AC-4301-1
  it("trova le formule, il trattino lungo, l'importo e la legge, ognuno con start ed end che delimitano il testo trovato", () => {
    const text = "In conclusione, è importante sottolineare che il noleggio costa 45 € al mese — secondo la legge 104.";

    expect(found(text, "it")).toEqual(
      expect.arrayContaining([
        ["ai_pattern", "In conclusione"],
        ["ai_pattern", "è importante sottolineare"],
        ["ai_pattern", "—"],
        ["to_verify", "45 €"],
        ["to_verify", "legge 104"],
      ])
    );
  });

  // covers: AC-4301-2
  it("un blocco di 300 parole con una formula tipica non supera la soglia, con tre sì", () => {
    const one = block300("Al giorno d'oggi il letto si sceglie con calma.");
    const three = block300("Al giorno d'oggi il letto si sceglie con calma. In conclusione conta il comfort. Scopriamo insieme i modelli.");

    expect(analyzeStyle(one, "it").overLimit).toBe(false);
    expect(analyzeStyle(three, "it").overLimit).toBe(true);
  });

  it("la soglia cresce con le parole: 3 tratti in 600 parole non la superano, 4 sì; 2 tratti in un blocco breve sì", () => {
    const formulas = "Al giorno d'oggi il letto si sceglie con calma. In conclusione conta il comfort. Scopriamo insieme i modelli.";
    const three = `${block300(formulas)} ${block300("Il letto")}`;
    const four = `${block300(`${formulas} In questo articolo.`)} ${block300("Il letto")}`;

    expect(analyzeStyle(three, "it")).toMatchObject({ overLimit: false, score: 1.5 });
    expect(analyzeStyle(four, "it").overLimit).toBe(true);
    expect(analyzeStyle("In conclusione il letto conta. Scopriamo insieme i modelli.", "it").overLimit).toBe(true);
  });

  it("le corrispondenze to_verify non contano per la soglia", () => {
    const text = block300("Costa 45 € e 1.200 USD, il 20% in più dal 2024 secondo il D.Lgs. 81/2008 e la legge 104 [da verificare: prezzo].");

    const analysis = analyzeStyle(text, "it");
    expect(analysis.matches.filter((match) => match.kind === "to_verify")).toHaveLength(7);
    expect(analysis).toMatchObject({ overLimit: false, score: 0 });
  });

  it("legge 104 è un solo dato da verificare, non anche la cifra 104", () => {
    expect(found("Vale la legge 104 per tutti.", "it")).toEqual([["to_verify", "legge 104"]]);
  });

  it("regole inglesi e spagnole, anche con le maiuscole e l'apostrofo tipografico", () => {
    expect(found("In today’s world, it is important to note that we DELVE INTO the topic.", "en")).toEqual([
      ["ai_pattern", "In today’s world"],
      ["ai_pattern", "it is important to note"],
      ["ai_pattern", "DELVE INTO"],
    ]);
    expect(found("En conclusión, cabe destacar que no solo es cómodo, sino también barato.", "es")).toEqual([
      ["ai_pattern", "En conclusión"],
      ["ai_pattern", "cabe destacar"],
      ["ai_pattern", "no solo es cómodo, sino también"],
    ]);
  });

  it("per una lingua senza elenco valgono solo i tratti comuni a ogni lingua", () => {
    expect(found("In conclusione — fine 🚀", "de")).toEqual([
      ["ai_pattern", "—"],
      ["ai_pattern", "🚀"],
    ]);
  });

  it("più di 2 domande retoriche di fila e più di 2 frasi di fila con la stessa parola iniziale sono un tratto ciascuna", () => {
    const questions = "Il letto è comodo. Serve davvero? Costa troppo? Conviene noleggiarlo? Sì, spesso.";
    const openings = "Il letto è comodo. Il materasso è rigido. Il cuscino è morbido. Ogni modello cambia.";

    expect(found(questions, "it")).toEqual([["ai_pattern", "Serve davvero? Costa troppo? Conviene noleggiarlo?"]]);
    expect(found(openings, "it")).toEqual([["ai_pattern", "Il letto è comodo. Il materasso è rigido. Il cuscino è morbido."]]);
    expect(found("Serve davvero? Costa troppo? Il letto è comodo. Il materasso è rigido.", "it")).toEqual([]);
  });

  it("i segnaposto delle tre lingue, gli anni e le cifre di 3 o più caratteri sono dati da verificare", () => {
    const text = "[da verificare: prezzo] [fonte da aggiungere] [por verificar: dato] [fuente por añadir] [to verify: fact] [source to add] dal 2019, 350 posti, 3,5 metri, 12 mesi.";

    expect(found(text, "it")).toEqual([
      ["to_verify", "[da verificare: prezzo]"],
      ["to_verify", "[fonte da aggiungere]"],
      ["to_verify", "[por verificar: dato]"],
      ["to_verify", "[fuente por añadir]"],
      ["to_verify", "[to verify: fact]"],
      ["to_verify", "[source to add]"],
      ["to_verify", "2019"],
      ["to_verify", "350"],
      ["to_verify", "3,5"],
    ]);
  });

  it("testi di 20.000 caratteri si analizzano entro 50 ms (CWE-1333)", () => {
    const inputs = [
      "non solo ".repeat(2_300),
      "1,".repeat(10_000),
      "legge ".repeat(3_400),
      "[da verificare: ".repeat(1_300),
      "Serve? ".repeat(2_900),
      `${"9".repeat(19_999)}x`,
      "In conclusione il letto conta. ".repeat(650),
      " ".repeat(20_000),
    ];
    analyzeStyle(inputs[6], "it");
    for (const input of inputs) {
      expect(input.length).toBeGreaterThanOrEqual(19_000);
      const times = [0, 1, 2].map(() => {
        const start = performance.now();
        analyzeStyle(input, "it");
        return performance.now() - start;
      });
      expect(Math.min(...times)).toBeLessThan(50);
    }
  });
});
