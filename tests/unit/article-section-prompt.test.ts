// Gate di T-4201 (AC-4201-3): la richiesta di un blocco vieta di inventare prezzi e indica il segnaposto da verificare;
// i dati del blocco hanno il suo tetto di parole e le sue keyword. In più le istruzioni in spagnolo e in inglese, i link
// del blocco con l'id breve, l'istruzione dell'autore, il controllo della risposta (keyword principale
// nell'introduzione, link della scaletta) e i problemi della riscrittura dei controlli (T-4302).
import { describe, expect, it } from "vitest";
import { AiTitlesError } from "@/lib/ai/errors";
import { buildFaqRequest } from "@/lib/articles/faq-prompt";
import type { OutlineBlock } from "@/lib/articles/outline-response";
import { buildSectionRequest, type SectionInput } from "@/lib/articles/section-prompt";
import { parseSectionResponse } from "@/lib/articles/section-response";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

const keyword = (text: string, isQuestion = false) => ({ keyword: text, canonical: canonicalizeKeyword(text, "it"), isQuestion });

const BLOCKS: OutlineBlock[] = [
  { position: 0, kind: "INTRO", heading: null, covers: "Chi sceglie il noleggio a lungo termine e perché", keywords: ["noleggio auto lungo termine"], words: 150, links: ["pagina-pilastro"] },
  { position: 1, kind: "H2", heading: "Quanto costa il noleggio", covers: "Il costo del noleggio: da cosa dipende il canone mensile", keywords: ["costo noleggio lungo termine"], words: 300, links: [] },
  { position: 2, kind: "H2", heading: "Cosa è incluso", covers: "Servizi compresi nel canone", keywords: [], words: 250, links: ["altro-spoke"] },
];

/** Spoke in italiano con la scheda del progetto senza prezzi; si scrive il blocco sul costo del noleggio. */
const costInput: SectionInput = {
  plan: {
    language: "it",
    country: "IT",
    page: {
      kind: "SPOKE",
      contentType: "guide",
      main: keyword("noleggio auto lungo termine"),
      secondary: [keyword("costo noleggio lungo termine"), keyword("cosa include il noleggio a lungo termine", true)],
    },
    h1: "Noleggio auto a lungo termine: come funziona",
    h2: ["Quanto costa il noleggio", "Cosa è incluso"],
    linkable: [
      { pageId: "pagina-pilastro", role: "pillar", h1: "Noleggio auto: la guida" },
      { pageId: "altro-spoke", role: "spoke", h1: "Noleggio con anticipo zero" },
    ],
  },
  brief: { about: "Agenzia di noleggio auto a Milano", audience: "Privati e partite IVA", tone: "professional" },
  notes: null,
  blocks: BLOCKS,
  position: 1,
  instruction: null,
};

type SentData = {
  outline: { id: string; heading: string | null; covers: string }[];
  block: { id: string; heading: string | null; covers: string; keywords: string[]; maxWords: number; links: { target: string; h1: string }[] };
  instruction?: string;
} & Record<string, unknown>;

const sentData = (input: SectionInput) => JSON.parse(buildSectionRequest(input).messages[1].content) as SentData;

function rejection(content: string, input: SectionInput): unknown {
  try {
    parseSectionResponse(content, input);
  } catch (error) {
    return error;
  }
  return null;
}

describe("richiesta di un blocco dell'articolo", () => {
  // covers: AC-4201-3
  it("vieta di inventare prezzi con il segnaposto da verificare; i dati del blocco hanno il tetto di parole e le keyword assegnate", () => {
    const request = buildSectionRequest(costInput);
    const instructions = request.messages[0].content;

    expect(instructions).toContain("non inventare prezzi");
    expect(instructions).toContain("[da verificare: …]");
    expect(instructions).toContain("[fonte da aggiungere]");
    expect(instructions).toContain("«In conclusione»");
    const data = sentData(costInput);
    expect(data.block).toEqual({
      id: "H2_1",
      heading: "Quanto costa il noleggio",
      covers: "Il costo del noleggio: da cosa dipende il canone mensile",
      keywords: ["costo noleggio lungo termine"],
      maxWords: 300,
      links: [],
    });
    expect(data.outline.map((block) => block.id)).toEqual(["INTRO", "H2_1", "H2_2"]);
    expect(data).toMatchObject({ mainKeyword: "noleggio auto lungo termine", brief: { about: "Agenzia di noleggio auto a Milano", tone: "professional" } });
    expect(data).not.toHaveProperty("instruction");
  });

  it("i link del blocco vanno al modello con l'id breve della pagina e il suo H1; l'istruzione dell'autore è tra i dati", () => {
    const intro = { ...costInput, position: 0, instruction: "Cita il servizio di consegna a domicilio" };

    const data = sentData(intro);

    expect(data.block).toMatchObject({ id: "INTRO", heading: null, links: [{ target: "page:L1", h1: "Noleggio auto: la guida" }] });
    expect(data.instruction).toBe("Cita il servizio di consegna a domicilio");
    expect(sentData({ ...costInput, position: 2 }).block.links).toEqual([{ target: "page:L2", h1: "Noleggio con anticipo zero" }]);
  });

  it("istruzioni in spagnolo con la variante del paese e in inglese con la lingua indicata per le altre", () => {
    const spanish = buildSectionRequest({ ...costInput, plan: { ...costInput.plan, language: "es", country: "MX" } }).messages[0].content;
    expect(spanish).toContain("en español de México");
    expect(spanish).toContain("[por verificar: …]");
    expect(spanish).toContain("«Cabe destacar»");

    const german = buildSectionRequest({ ...costInput, plan: { ...costInput.plan, language: "de", country: "DE" } }).messages[0].content;
    expect(german).toContain("in German");
    expect(german).toContain("[to verify: …]");
    expect(german).toContain("[source to add]");
  });

  it("la riscrittura dei controlli (T-4302) porta i problemi tra i dati e la regola che li spiega; la prima stesura no", () => {
    const problems = [
      { rule: "phrase", text: "In conclusione" },
      { rule: "link_missing", target: "page:L1" },
    ];
    const rewrite = buildSectionRequest({ ...costInput, problems });

    expect(JSON.parse(rewrite.messages[1].content)).toMatchObject({ problems });
    expect(rewrite.messages[0].content).toContain("nei dati c'è problems");
    expect(buildFaqRequest({ ...costInput, problems }).messages[0].content).toContain("nei dati c'è problems");
    expect(buildSectionRequest({ ...costInput, plan: { ...costInput.plan, language: "es", country: "ES" }, problems }).messages[0].content).toContain(
      "en los datos está problems"
    );
    expect(buildSectionRequest(costInput).messages[0].content).not.toContain("problems");
    expect(sentData(costInput)).not.toHaveProperty("problems");
  });
});

describe("controllo del testo di un blocco", () => {
  it("l'introduzione senza la keyword principale nelle prime 100 parole è AI_INVALID_RESPONSE", () => {
    const intro = { ...costInput, position: 0 };
    const late = `${"parola ".repeat(100)}noleggio auto lungo termine.`;

    const error = rejection(late, intro);

    expect(error).toBeInstanceOf(AiTitlesError);
    expect((error as AiTitlesError).code).toBe("AI_INVALID_RESPONSE");
    expect(parseSectionResponse("Il **noleggio** di un'auto a lungo termine conviene a chi percorre molti chilometri.", intro)).toContain("**noleggio**");
  });

  it("tiene il link verso la pagina del blocco con il suo id e toglie quello verso una pagina di un altro blocco", () => {
    const body = parseSectionResponse("Il noleggio auto lungo termine: leggi [la guida](page:L1) e [l'offerta](page:L2).", { ...costInput, position: 0 });

    expect(body).toBe("Il noleggio auto lungo termine: leggi [la guida](page:pagina-pilastro) e l'offerta.");
  });
});
