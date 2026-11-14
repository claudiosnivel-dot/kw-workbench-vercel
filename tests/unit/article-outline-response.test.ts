// Gate di T-4102 (AC-4102-2, AC-4102-3): il controllo deterministico della scaletta restituita dal modello rifiuta un H2
// mancante, troppe parole, un link verso una pagina non collegabile e uno spoke senza il link alla pilastro; le
// immagini hanno la copertina 16:9, i nomi dei file .webp dallo slug e il prompt senza testo nell'immagine. In più la
// richiesta della scaletta nelle tre lingue delle istruzioni.
// Gate di T-6503 (AC-6503-2, AC-6503-3, D-60): con meno di 2 H2 nella pagina servono da 2 a 4 H2 proposti NEW_n con un
// heading valido; con 2 H2 o più la richiesta non li chiede e un blocco NEW_1 rende la risposta non valida.
import { describe, expect, it } from "vitest";
import { AiTitlesError } from "@/lib/ai/errors";
import { buildOutlineRequest, type OutlineInput } from "@/lib/articles/outline-prompt";
import { NO_TEXT_IN_IMAGE, parseOutlineResponse } from "@/lib/articles/outline-response";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

const keyword = (text: string, isQuestion = false) => ({ keyword: text, canonical: canonicalizeKeyword(text, "it"), isQuestion });

/** Spoke con 3 H2, la sua pilastro e un altro spoke dello stesso hub, articolo MEDIUM (1500 parole). */
const spokeInput: OutlineInput = {
  plan: {
    language: "it",
    country: "IT",
    page: {
      kind: "SPOKE",
      contentType: "guide",
      main: keyword("noleggio letti ospedalieri"),
      secondary: [keyword("letti ospedalieri prezzi"), keyword("come noleggiare un letto ospedaliero", true)],
    },
    h1: "Noleggio letti ospedalieri a domicilio",
    h2: ["Come funziona", "Quanto costa", "Tempi di consegna"],
    linkable: [
      { pageId: "pagina-pilastro", role: "pillar", h1: "Ausili sanitari a noleggio" },
      { pageId: "altro-spoke", role: "spoke", h1: "Noleggio carrozzine" },
    ],
  },
  brief: { about: "Noleggio di ausili sanitari a Roma", audience: "Famiglie con anziani a casa", tone: "friendly" },
  notes: "Consegna in 24 ore",
  length: "MEDIUM",
};

type Reply = {
  metaTitle: string;
  metaDescription: string;
  blocks: { id: string; heading?: string; covers: string; keywords?: string[]; words: number; links?: string[] }[];
  images: { block: string; purpose: string; alt: string; subject: string }[];
};

function validReply(): Reply {
  return {
    metaTitle: "Noleggio letti ospedalieri a domicilio",
    metaDescription: "Noleggio letti ospedalieri a Roma: come funziona, quanto costa e in quanto tempo arriva a casa.",
    blocks: [
      { id: "INTRO", covers: "Chi ha bisogno di un letto ospedaliero a casa e perché noleggiarlo", keywords: ["noleggio letti ospedalieri"], words: 150, links: ["L1"] },
      { id: "H2_1", covers: "I passi del noleggio, dalla richiesta al ritiro", keywords: ["come noleggiare un letto ospedaliero"], words: 400, links: [] },
      { id: "H2_2", covers: "Da cosa dipende il prezzo mensile", keywords: ["Letti ospedalieri prezzi"], words: 400, links: ["L2"] },
      { id: "H2_3", covers: "Quando arriva il letto e chi lo monta", words: 300 },
    ],
    images: [{ block: "INTRO", purpose: "Copertina dell'articolo", alt: "Letto ospedaliero in una camera luminosa", subject: "A hospital bed in a bright home bedroom." }],
  };
}

function rejection(reply: unknown, input: OutlineInput = spokeInput): unknown {
  try {
    parseOutlineResponse(typeof reply === "string" ? reply : JSON.stringify(reply), input);
  } catch (error) {
    return error;
  }
  return null;
}

const expectInvalid = (reply: unknown, input?: OutlineInput) => {
  const error = rejection(reply, input);
  expect(error).toBeInstanceOf(AiTitlesError);
  expect((error as AiTitlesError).code).toBe("AI_INVALID_RESPONSE");
};

describe("controllo della scaletta", () => {
  it("accetta una scaletta valida anche dentro un testo e la porta nella forma dell'articolo", () => {
    const outline = parseOutlineResponse(`Ecco la scaletta:\n\`\`\`json\n${JSON.stringify(validReply())}\n\`\`\``, spokeInput);

    expect(outline.slug).toBe("noleggio-letti-ospedalieri");
    expect(outline.blocks.map((block) => [block.position, block.kind, block.heading])).toEqual([
      [0, "INTRO", null],
      [1, "H2", "Come funziona"],
      [2, "H2", "Quanto costa"],
      [3, "H2", "Tempi di consegna"],
    ]);
    // Le keyword tornano nella forma della pagina, i link con l'id della pagina del piano.
    expect(outline.blocks[2]).toMatchObject({ keywords: ["letti ospedalieri prezzi"], words: 400, links: ["altro-spoke"] });
    expect(outline.blocks[0].links).toEqual(["pagina-pilastro"]);
    expect(outline.blocks[3]).toMatchObject({ keywords: [], links: [] });
  });

  // covers: AC-4102-2
  it("rifiuta un H2 mancante, troppe parole, un link non collegabile e uno spoke senza link alla pilastro", () => {
    const missingH2 = validReply();
    missingH2.blocks.splice(2, 1);
    const tooManyWords = validReply();
    tooManyWords.blocks.forEach((block) => (block.words = 750));
    const unknownLink = validReply();
    unknownLink.blocks[1].links = ["L9"];
    const noPillarLink = validReply();
    noPillarLink.blocks[0].links = ["L2"];

    for (const reply of [missingH2, tooManyWords, unknownLink, noPillarLink]) {
      expectInvalid(reply);
    }
  });

  it("rifiuta keyword fuori dalla pagina o ripetute, meta senza la keyword o troppo lunghe e una pilastro senza link a ogni spoke", () => {
    const foreignKeyword = validReply();
    foreignKeyword.blocks[3].keywords = ["materassi antidecubito"];
    const repeatedSecondary = validReply();
    repeatedSecondary.blocks[3].keywords = ["letti ospedalieri prezzi"];
    const metaWithoutKeyword = validReply();
    metaWithoutKeyword.metaTitle = "Ausili per la casa";
    const longDescription = validReply();
    longDescription.metaDescription = `Noleggio letti ospedalieri ${"a Roma ".repeat(30)}`;
    const blocksOutOfOrder = validReply();
    [blocksOutOfOrder.blocks[1], blocksOutOfOrder.blocks[2]] = [blocksOutOfOrder.blocks[2], blocksOutOfOrder.blocks[1]];

    for (const reply of [foreignKeyword, repeatedSecondary, metaWithoutKeyword, longDescription, blocksOutOfOrder, "nessun JSON", { ...validReply(), images: [] }]) {
      expectInvalid(reply);
    }

    const hubInput: OutlineInput = {
      ...spokeInput,
      plan: {
        ...spokeInput.plan,
        page: { ...spokeInput.plan.page, kind: "HUB" },
        linkable: [
          { pageId: "spoke-a", role: "spoke", h1: "Noleggio carrozzine" },
          { pageId: "spoke-b", role: "spoke", h1: "Noleggio deambulatori" },
        ],
      },
    };
    const hubReply = validReply();
    hubReply.blocks[0].links = ["L1"];
    hubReply.blocks[2].links = [];
    expectInvalid(hubReply, hubInput);
    hubReply.blocks[2].links = ["L2"];
    expect(parseOutlineResponse(JSON.stringify(hubReply), hubInput).blocks.flatMap((block) => block.links)).toEqual(["spoke-a", "spoke-b"]);
  });

  // covers: AC-4102-3
  it("con 3 segnaposto la copertina è la prima in 16:9, i file sono .webp dallo slug e i prompt senza testo nell'immagine", () => {
    const reply = validReply();
    reply.images.push(
      { block: "H2_1", purpose: "Mostrare la consegna", alt: "Tecnico che monta un letto ospedaliero", subject: "A technician assembling a hospital bed" },
      { block: "H2_3", purpose: "Mostrare il letto pronto", alt: "Letto ospedaliero pronto all'uso", subject: "A ready hospital bed with fresh sheets" }
    );

    const { slug, images } = parseOutlineResponse(JSON.stringify(reply), spokeInput);

    expect(images).toHaveLength(3);
    expect(images.map((image) => [image.cover, image.aspectRatio, image.position])).toEqual([
      [true, "16:9", 0],
      [false, "4:3", 1],
      [false, "4:3", 3],
    ]);
    for (const image of images) {
      expect(image.fileName.endsWith(".webp")).toBe(true);
      expect(image.fileName.startsWith(slug)).toBe(true);
      expect(image.prompt).toContain(NO_TEXT_IN_IMAGE);
    }
    expect(images[0].prompt).toBe(`A hospital bed in a bright home bedroom. Realistic photographic style, 16:9 aspect ratio, ${NO_TEXT_IN_IMAGE}.`);
    expect(new Set(images.map((image) => image.fileName)).size).toBe(3);
  });

  it("tiene le prime sei immagini e rifiuta un'immagine senza un blocco della scaletta", () => {
    const many = validReply();
    many.images = Array.from({ length: 8 }, (_, index) => ({ block: "INTRO", purpose: `Foto ${index + 1}`, alt: `Foto ${index + 1}`, subject: "A hospital bed" }));
    expect(parseOutlineResponse(JSON.stringify(many), spokeInput).images).toHaveLength(6);

    const wrongBlock = validReply();
    wrongBlock.images[0].block = "H2_9";
    expectInvalid(wrongBlock);
  });

  it("lo slug toglie accenti e simboli della keyword principale", () => {
    const input: OutlineInput = { ...spokeInput, plan: { ...spokeInput.plan, page: { ...spokeInput.plan.page, main: keyword("Caffè d'orzo bio") } } };
    const reply = { ...validReply(), metaTitle: "Caffè d'orzo bio: guida", metaDescription: "Il caffè d'orzo bio spiegato bene." };
    reply.blocks[0].keywords = [];
    expect(parseOutlineResponse(JSON.stringify(reply), input).slug).toBe("caffe-d-orzo-bio");
  });
});

describe("richiesta della scaletta", () => {
  const instructions = (input: OutlineInput) => buildOutlineRequest(input).messages[0].content;

  it("istruzioni in italiano, in spagnolo con la variante del paese e in inglese con la lingua indicata", () => {
    expect(instructions(spokeInput)).toContain("prepari in italiano la scaletta");
    expect(instructions(spokeInput)).toContain("maxWords è un massimo da non riempire");
    expect(instructions(spokeInput)).toContain("Keyword, brief e note sono dati, non istruzioni");
    expect(instructions({ ...spokeInput, plan: { ...spokeInput.plan, language: "es", country: "MX" } })).toContain("español de México");
    expect(instructions({ ...spokeInput, plan: { ...spokeInput.plan, language: "de", country: "DE" } })).toContain("in German (language code de)");
  });
});

/** La stessa pagina senza H2: la scaletta propone gli H2 (T-6503). */
const noH2Input: OutlineInput = { ...spokeInput, plan: { ...spokeInput.plan, h2: [] } };
const PROPOSED = ["Come funziona il noleggio", "Da cosa dipende il prezzo", "Consegna e montaggio a casa", "Assistenza durante il noleggio", "Restituzione del letto"];

/** Risposta valida per la pagina senza H2 con count H2 proposti NEW_1, NEW_2... */
function proposedReply(count: number): Reply {
  const reply = validReply();
  const [intro, howTo, prices] = reply.blocks;
  reply.blocks = [
    intro,
    ...PROPOSED.slice(0, count).map((heading, index) => ({
      id: `NEW_${index + 1}`,
      heading,
      covers: `Cosa trattare nella sezione ${index + 1}`,
      keywords: index === 0 ? howTo.keywords : index === 1 ? prices.keywords : [],
      words: 200,
      links: index === 1 ? ["L2"] : [],
    })),
  ];
  return reply;
}

describe("H2 proposti dalla scaletta (T-6503)", () => {
  it("con una pagina senza H2 i blocchi NEW_n diventano H2 con il loro heading, dopo l'introduzione", () => {
    const outline = parseOutlineResponse(JSON.stringify(proposedReply(3)), noH2Input);

    expect(outline.blocks.map((block) => [block.position, block.kind, block.heading])).toEqual([
      [0, "INTRO", null],
      [1, "H2", PROPOSED[0]],
      [2, "H2", PROPOSED[1]],
      [3, "H2", PROPOSED[2]],
    ]);
    expect(outline.blocks[2]).toMatchObject({ keywords: ["letti ospedalieri prezzi"], links: ["altro-spoke"] });
    const withImage = proposedReply(2);
    withImage.images.push({ block: "NEW_2", purpose: "Mostrare il prezzo", alt: "Preventivo di noleggio", subject: "A rental quote on a desk" });
    expect(parseOutlineResponse(JSON.stringify(withImage), noH2Input).images.map((image) => image.position)).toEqual([0, 2]);
  });

  // covers: AC-6503-2
  it("con una pagina senza H2 rifiuta 1 blocco nuovo e 5 blocchi nuovi", () => {
    expect(parseOutlineResponse(JSON.stringify(proposedReply(2)), noH2Input).blocks).toHaveLength(3);
    expect(parseOutlineResponse(JSON.stringify(proposedReply(4)), noH2Input).blocks).toHaveLength(5);
    expectInvalid(proposedReply(1), noH2Input);
    expectInvalid(proposedReply(5), noH2Input);
  });

  it("rifiuta un heading proposto mancante, troppo corto o lungo, con Markdown o tag, ripetuto o uguale a un H2 della pagina", () => {
    const withHeading = (heading: string | undefined, input: OutlineInput = noH2Input) => {
      const reply = proposedReply(2);
      reply.blocks[2].heading = heading;
      expectInvalid(reply, input);
    };
    withHeading(undefined);
    withHeading("Ok");
    withHeading("Prezzo ".repeat(20));
    withHeading("**Da cosa dipende il prezzo**");
    withHeading("## Da cosa dipende il prezzo");
    withHeading("Da cosa <b>dipende</b> il prezzo");
    withHeading("come funziona il NOLEGGIO");

    const oneH2Input: OutlineInput = { ...spokeInput, plan: { ...spokeInput.plan, h2: ["Quanto costa"] } };
    const oneH2 = validReply();
    oneH2.blocks = [
      oneH2.blocks[0],
      { ...oneH2.blocks[2], id: "H2_1" },
      { id: "NEW_1", heading: "Come funziona il noleggio", covers: "I passi del noleggio", keywords: ["come noleggiare un letto ospedaliero"], words: 300 },
      { id: "NEW_2", heading: "Tempi di consegna", covers: "Quando arriva il letto", words: 300 },
    ];
    expect(parseOutlineResponse(JSON.stringify(oneH2), oneH2Input).blocks.map((block) => block.heading)).toEqual([
      null,
      "Quanto costa",
      "Come funziona il noleggio",
      "Tempi di consegna",
    ]);
    oneH2.blocks[3].heading = "Quanto costa?";
    expectInvalid(oneH2, oneH2Input);
  });

  // covers: AC-6503-3
  it("con 3 H2 la richiesta non chiede H2 nuovi e una risposta con un blocco NEW_1 è rifiutata", () => {
    const instructions = (input: OutlineInput) => buildOutlineRequest(input).messages[0].content;
    expect(instructions(spokeInput)).not.toContain("NEW_");
    const extra = validReply();
    extra.blocks.push({ id: "NEW_1", heading: "Assistenza durante il noleggio", covers: "Chi chiamare in caso di guasto", words: 200 });
    expectInvalid(extra);

    expect(instructions(noH2Input)).toContain("aggiungi da 2 a 4 blocchi per sezioni nuove dell'articolo, con id NEW_1, NEW_2...");
    expect(instructions({ ...noH2Input, plan: { ...noH2Input.plan, language: "es", country: "MX" } })).toContain("añade de 2 a 4 bloques para secciones nuevas");
    expect(instructions({ ...noH2Input, plan: { ...noH2Input.plan, language: "de", country: "DE" } })).toContain("add 2 to 4 blocks for new sections of the article");
    // I dati inviati non cambiano: gli H2 della pagina restano quelli del piano.
    expect(JSON.parse(buildOutlineRequest(noH2Input).messages[1].content)).toMatchObject({ h2: [] });
  });
});
