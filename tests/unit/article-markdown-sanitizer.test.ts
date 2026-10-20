// Gate di T-4201 (AC-4201-2): la pulizia del testo di un blocco tiene paragrafi, grassetto, corsivo, elenchi, H3 e i
// link page: della scaletta del blocco; toglie HTML, titoli di livello 1 e 2, immagini, tabelle, blocchi di codice e ogni
// altro link lasciandone il testo. In più il conteggio delle parole, i segnaposto, il testo dentro un recinto di codice e
// il blocco vuoto dopo la pulizia.
import { describe, expect, it } from "vitest";
import { AiTitlesError } from "@/lib/ai/errors";
import { markdownWords, sanitizeSectionMarkdown } from "@/lib/articles/markdown-sanitizer";

const PILLAR_ID = "pagina-pilastro-1";
const LINKS = new Map([["L1", PILLAR_ID]]);

function rejection(body: string): unknown {
  try {
    sanitizeSectionMarkdown(body, LINKS);
  } catch (error) {
    return error;
  }
  return null;
}

describe("pulizia del Markdown di un blocco", () => {
  // covers: AC-4201-2
  it("toglie lo script, il titolo di livello 1, il link esterno e quello verso una pagina fuori dalla scaletta; tiene i testi dei link e l'elenco puntato", () => {
    const body = [
      "<script>x</script>",
      "# Titolo",
      "Prima di scegliere leggi la [guida completa](page:L1) e il [parere di un esperto](https://esterno.example).",
      "Vedi anche [un'altra pagina](page:pagina-fuori-scaletta).",
      "",
      "- primo punto",
      "- secondo punto",
    ].join("\n");

    const result = sanitizeSectionMarkdown(body, LINKS);

    expect(result).not.toContain("script");
    expect(result).not.toContain("# ");
    expect(result).not.toContain("https://esterno.example");
    expect(result).not.toContain("page:pagina-fuori-scaletta");
    expect(result).toContain(`[guida completa](page:${PILLAR_ID})`);
    expect(result).toContain("parere di un esperto");
    expect(result).toContain("Vedi anche un'altra pagina.");
    expect(result).toContain("- primo punto\n- secondo punto");
  });

  it("tiene grassetto, corsivo, elenchi numerati e H3; toglie H2, porta H4 a H3 e toglie immagini, tabelle e codice", () => {
    const body = [
      "## Titolo del blocco ripetuto",
      "Un paragrafo con **grassetto** e *corsivo*.",
      "",
      "![Foto](https://immagini.example/foto.webp)",
      "#### Dettagli",
      "1. primo",
      "2. secondo",
      "",
      "| Piano | Prezzo |",
      "| --- | --- |",
      "| Base | 10 € |",
      "",
      "```js",
      "alert('codice');",
      "```",
      "Ultimo paragrafo con `codice in linea` e ~~barrato~~.",
    ].join("\n");

    const result = sanitizeSectionMarkdown(body, LINKS);

    expect(result).toBe(
      ["Un paragrafo con **grassetto** e *corsivo*.", "", "### Dettagli", "1. primo", "2. secondo", "", "Ultimo paragrafo con codice in linea e barrato."].join(
        "\n"
      )
    );
  });

  it("toglie i tag HTML lasciando il testo, gli indirizzi web scritti nel testo e le citazioni; tiene i segnaposto", () => {
    const body = [
      "<p>Il canone parte da <strong>[da verificare: canone mensile]</strong>.</p>",
      "> Secondo uno studio [fonte da aggiungere] il noleggio conviene: www.esempio.example e https://altro.example/pagina.",
      "<!-- commento -->Fine.",
      '<img src="x" onerror="alert(1)">',
    ].join("\n");

    const result = sanitizeSectionMarkdown(body, LINKS);

    expect(result).toContain("Il canone parte da [da verificare: canone mensile].");
    expect(result).toContain("Secondo uno studio [fonte da aggiungere] il noleggio conviene:");
    expect(result).not.toMatch(/<|>|www\.|https?:|onerror|commento/);
    expect(result).toContain("Fine.");
  });

  it("un testo tutto dentro un recinto di codice vale come testo del blocco", () => {
    expect(sanitizeSectionMarkdown("```markdown\nUn blocco scritto dentro il recinto.\n```", LINKS)).toBe("Un blocco scritto dentro il recinto.");
  });

  it("un blocco vuoto dopo la pulizia è AI_INVALID_RESPONSE", () => {
    for (const body of ["", "<div></div>", "## Solo il titolo", "![Foto](https://immagini.example/foto.webp)"]) {
      const error = rejection(body);
      expect(error, body).toBeInstanceOf(AiTitlesError);
      expect((error as AiTitlesError).code).toBe("AI_INVALID_RESPONSE");
    }
  });

  it("testi di 60.000 caratteri fatti di parentesi, titoli o tag si puliscono in tempo lineare (CWE-1333)", () => {
    const inputs = ["[".repeat(60_000), "[a](".repeat(15_000), "](".repeat(30_000), `# ${" ".repeat(60_000)}x`, "<a".repeat(30_000)];
    const start = Date.now();
    for (const input of inputs) {
      try {
        markdownWords(sanitizeSectionMarkdown(`${input}x`, LINKS));
      } catch {
        // Un testo vuoto dopo la pulizia è rifiutato: conta solo il tempo.
      }
    }
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  it("conta le parole del testo senza la sintassi del Markdown né la destinazione dei link", () => {
    expect(markdownWords(`### Titolo\n\n- **Una** [guida](page:${PILLAR_ID}) dell'autore, 2 volte.`)).toEqual(["Titolo", "Una", "guida", "dell'autore", "2", "volte"]);
  });
});
