// Gate di T-4202 (AC-4202-2): il controllo delle domande frequenti rifiuta 2 coppie, 7 coppie e una domanda senza il
// punto interrogativo. In più le risposte fuori dalle 20-120 parole, la pulizia delle risposte, il Markdown del blocco e
// la richiesta con le keyword-domanda nelle tre lingue.
import { describe, expect, it } from "vitest";
import { AiTitlesError } from "@/lib/ai/errors";
import { buildFaqRequest, type FaqInput } from "@/lib/articles/faq-prompt";
import { faqMarkdown, parseFaqResponse } from "@/lib/articles/faq-response";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

const ANSWER = "Dipende dalla durata del contratto e dai chilometri: per un preventivo preciso servono il modello, gli anni di noleggio e i servizi che vuoi includere nel canone.";

const pair = (index: number) => ({ question: `Domanda numero ${index} sul noleggio?`, answer: ANSWER });
const pairs = (count: number) => Array.from({ length: count }, (_, index) => pair(index + 1));

function rejection(reply: unknown): unknown {
  try {
    parseFaqResponse(JSON.stringify(reply));
  } catch (error) {
    return error;
  }
  return null;
}

const keyword = (text: string, isQuestion = false) => ({ keyword: text, canonical: canonicalizeKeyword(text, "it"), isQuestion });

const faqInput: FaqInput = {
  plan: {
    language: "it",
    country: "IT",
    page: {
      kind: "SPOKE",
      contentType: "guide",
      main: keyword("noleggio auto lungo termine"),
      secondary: [keyword("costo noleggio lungo termine"), keyword("conviene il noleggio a lungo termine", true), keyword("noleggio lungo termine privati")],
    },
    h1: "Noleggio auto a lungo termine: come funziona",
    h2: ["Quanto costa il noleggio"],
    linkable: [{ pageId: "pagina-pilastro", role: "pillar", h1: "Noleggio auto: la guida" }],
  },
  brief: { about: "Agenzia di noleggio auto a Milano", audience: "Privati e partite IVA", tone: "friendly" },
  notes: "Ritiro dell'usato possibile",
  blocks: [
    { position: 0, kind: "INTRO", heading: null, covers: "Perché il noleggio", keywords: [], words: 150, links: ["pagina-pilastro"] },
    { position: 1, kind: "H2", heading: "Quanto costa il noleggio", covers: "Il canone", keywords: [], words: 300, links: [] },
  ],
  instruction: null,
};

describe("controllo delle domande frequenti", () => {
  // covers: AC-4202-2
  it("rifiuta 2 coppie, 7 coppie e una domanda senza il punto interrogativo con AI_INVALID_RESPONSE", () => {
    const withoutMark = pairs(4);
    withoutMark[2] = { question: "Domanda senza punto interrogativo", answer: ANSWER };

    for (const reply of [{ faq: pairs(2) }, { faq: pairs(7) }, { faq: withoutMark }]) {
      const error = rejection(reply);
      expect(error, JSON.stringify(reply).slice(0, 80)).toBeInstanceOf(AiTitlesError);
      expect((error as AiTitlesError).code).toBe("AI_INVALID_RESPONSE");
    }
  });

  it("rifiuta una risposta sotto le 20 o sopra le 120 parole e una domanda oltre 150 caratteri", () => {
    const short = pairs(3);
    short[0] = { ...short[0], answer: "Dipende dal contratto." };
    const long = pairs(3);
    long[1] = { ...long[1], answer: "parola ".repeat(121) };
    const longQuestion = pairs(3);
    longQuestion[2] = { ...longQuestion[2], question: `${"lunga ".repeat(26)}?` };

    for (const reply of [{ faq: short }, { faq: long }, { faq: longQuestion }, { domande: pairs(3) }]) {
      expect((rejection(reply) as AiTitlesError).code).toBe("AI_INVALID_RESPONSE");
    }
  });

  it("accetta da 3 a 6 coppie, pulisce domande e risposte e le scrive con la domanda in grassetto", () => {
    const reply = {
      faq: [
        { question: "  ¿Cuánto **cuesta** el alquiler?  ", answer: `<b>${ANSWER}</b> Más datos en [este sitio](https://esterno.example).` },
        pair(2),
        pair(3),
      ],
    };

    const parsed = parseFaqResponse(`Ecco le domande:\n${JSON.stringify(reply)}`);

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ question: "¿Cuánto cuesta el alquiler?", answer: `${ANSWER} Más datos en este sitio.` });
    expect(faqMarkdown(parsed)).toBe(
      [`**¿Cuánto cuesta el alquiler?**`, `${ANSWER} Más datos en este sitio.`, "**Domanda numero 2 sul noleggio?**", ANSWER, "**Domanda numero 3 sul noleggio?**", ANSWER].join(
        "\n\n"
      )
    );
  });
});

describe("richiesta delle domande frequenti", () => {
  it("invia le keyword-domanda, le altre secondarie, la scaletta, la scheda e le note; le istruzioni hanno segnaposto e limiti", () => {
    const request = buildFaqRequest(faqInput);
    const data = JSON.parse(request.messages[1].content) as Record<string, unknown>;

    expect(data).toMatchObject({
      mainKeyword: "noleggio auto lungo termine",
      questionKeywords: ["conviene il noleggio a lungo termine"],
      otherKeywords: ["costo noleggio lungo termine", "noleggio lungo termine privati"],
      outline: [
        { id: "INTRO", heading: null, covers: "Perché il noleggio" },
        { id: "H2_1", heading: "Quanto costa il noleggio", covers: "Il canone" },
      ],
      brief: { about: "Agenzia di noleggio auto a Milano" },
      notes: "Ritiro dell'usato possibile",
    });
    const instructions = request.messages[0].content;
    expect(instructions).toContain("da 3 a 6");
    expect(instructions).toContain("[da verificare: …]");
    expect(buildFaqRequest({ ...faqInput, plan: { ...faqInput.plan, language: "es", country: "ES" } }).messages[0].content).toContain("[por verificar: …]");
    expect(buildFaqRequest({ ...faqInput, plan: { ...faqInput.plan, language: "en", country: "US" } }).messages[0].content).toContain("[to verify: …]");
  });
});
