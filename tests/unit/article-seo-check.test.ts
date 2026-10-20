// Gate di T-4302 (AC-4302-1, AC-4302-2): il controllo SEO dell'articolo trova la densità della keyword principale oltre
// 2,5 occorrenze ogni 100 parole e riconosce una keyword assegnata in forma vicina (stesse parole canoniche in qualunque
// ordine, plurali compresi). In più la keyword principale in H1, prime 100 parole e meta, le lunghezze delle meta, i
// link obbligatori dei blocchi e la densità di un solo blocco.
import { describe, expect, it } from "vitest";
import { analyzeSeo, type SeoArticle } from "@/lib/articles/seo-check";

const MAIN = "noleggio letto ospedaliero";

/** Testo di parole di riempimento, senza la keyword. */
const filler = (words: number) => Array.from({ length: words }, () => "casa").join(" ");

/** Articolo in italiano con H1 e meta che hanno la keyword principale, un'introduzione e i blocchi indicati. */
function article(blocks: Partial<SeoArticle["blocks"][number]>[], overrides: Partial<SeoArticle> = {}): SeoArticle {
  return {
    language: "it",
    mainKeyword: MAIN,
    h1: "Noleggio di un letto ospedaliero: come funziona",
    metaTitle: "Noleggio letto ospedaliero a domicilio",
    metaDescription: "Come funziona il noleggio di un letto ospedaliero, quanto dura e cosa comprende.",
    requiredLinks: [],
    blocks: blocks.map((block, position) => ({ position, body: "", keywords: [], links: [], ...block })),
    ...overrides,
  };
}

const problemsOf = (result: ReturnType<typeof analyzeSeo>, position: number) => result.blocks.find((block) => block.position === position)?.problems;

describe("controllo SEO dell'articolo", () => {
  // covers: AC-4302-1
  it("la keyword principale citata 9 volte in 300 parole è una densità oltre 2,5", () => {
    const body = `${Array.from({ length: 9 }, () => `${MAIN} ${filler(30)}`).join(" ")} ${filler(3)}`;

    const result = analyzeSeo(article([{ body }]));

    expect(result.density).toBe(3);
    expect(result.problems).toContainEqual(expect.objectContaining({ rule: "density" }));
  });

  // covers: AC-4302-2
  it("la keyword assegnata «letti ospedalieri elettrici» è presente nel testo «letto ospedaliero elettrico»", () => {
    const result = analyzeSeo(
      article([
        { body: `Il ${MAIN} si chiede online.` },
        { body: "Un letto ospedaliero elettrico si regola con il telecomando.", keywords: ["letti ospedalieri elettrici"] },
      ])
    );

    expect(problemsOf(result, 1)).not.toContainEqual(expect.objectContaining({ rule: "keyword_missing" }));
    expect(problemsOf(result, 1)).toEqual([]);
  });

  it("le parole della keyword sparse nel blocco non sono la keyword", () => {
    const result = analyzeSeo(
      article([
        { body: `Il ${MAIN} si chiede online.` },
        { body: "I letti si regolano. Gli ospedalieri li usano. I modelli elettrici costano.", keywords: ["letti ospedalieri elettrici"] },
      ])
    );

    expect(problemsOf(result, 1)).toEqual([{ rule: "keyword_missing", keyword: "letti ospedalieri elettrici" }]);
  });

  it("segnala la keyword principale assente da H1, prime 100 parole, meta title e meta description, e le meta troppo lunghe", () => {
    const result = analyzeSeo(
      article([{ body: `${filler(100)} ${MAIN}.` }], {
        h1: "Come funziona il servizio",
        metaTitle: `Guida completa al servizio per chi assiste una persona a casa ${"x".repeat(10)}`,
        metaDescription: null,
      })
    );

    expect(result.problems).toEqual([
      { rule: "main_keyword_h1" },
      { rule: "main_keyword_opening" },
      { rule: "main_keyword_meta_title" },
      { rule: "main_keyword_meta_description" },
      { rule: "meta_title_length", length: 72, max: 60 },
    ]);
  });

  it("un articolo con la keyword al posto giusto e la densità naturale non ha problemi", () => {
    const result = analyzeSeo(article([{ body: `Il ${MAIN} conviene a chi assiste a casa. ${filler(60)}` }, { body: filler(80) }]));

    expect(result.problems).toEqual([]);
    expect(result.blocks.map((block) => block.problems)).toEqual([[], []]);
  });

  it("un link obbligatorio del blocco assente è un problema; un link facoltativo assente no", () => {
    const result = analyzeSeo(
      article(
        [
          { body: `Il ${MAIN} e la [guida](page:pilastro).`, links: ["pilastro", "altro-spoke"] },
          { body: "Testo senza link.", links: ["pilastro"] },
        ],
        { requiredLinks: ["pilastro"] }
      )
    );

    expect(problemsOf(result, 0)).toEqual([]);
    expect(problemsOf(result, 1)).toEqual([{ rule: "link_missing", pageId: "pilastro" }]);
  });

  it("un blocco con la keyword principale troppe volte ha il problema della densità con il massimo di occorrenze; una sola citazione no", () => {
    const dense = `${MAIN} ${filler(30)} ${MAIN} ${filler(30)} ${MAIN} ${filler(28)}`;
    const result = analyzeSeo(article([{ body: `Il ${MAIN} si chiede online.` }, { body: dense }]));

    expect(problemsOf(result, 0)).toEqual([]);
    expect(problemsOf(result, 1)).toEqual([{ rule: "density", count: 3, max: 2 }]);
  });
});
