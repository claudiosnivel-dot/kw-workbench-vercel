// Gate di T-4102 (AC-4102-1): la fase outline del lavoro di un articolo invia al modello la pagina con la scheda del
// progetto, le note e le pagine collegabili, senza nome del progetto, volumi o punteggi, e salva meta, slug, scaletta,
// segnaposto immagine e i blocchi vuoti nell'ordine del piano. In più le istruzioni in spagnolo con la variante del
// paese e le pagine collegabili di una pilastro.
// impacted-by: T-4201 (dopo la scaletta il lavoro scrive i blocchi: il test esegue la sola fase outline, AC-4102-1 emendato)
// Gate di T-6503 (AC-6503-1, D-60): per una pagina senza H2 la scaletta propone gli H2, che diventano blocchi H2
// dell'articolo nell'ordine della risposta, mentre gli H2 della pagina nel piano restano vuoti.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceArticleRun } from "@/lib/articles/run";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import {
  articleCompletion,
  modelReply,
  outlineReply,
  saveArticleSettings,
  type SentOutlineData,
  sentBody,
  sentData,
  startArticle,
} from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

const fetchMock = vi.fn<typeof fetch>();
const PROJECT_NAME = "Cantiere-Segreto-XYZ";
const THREE_H2 = ["Come scegliere la taglia", "Ammortizzazione e peso", "Quanto durano"];
const PILLAR_H1 = "Scarpe running: la guida completa";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url, init) => articleCompletion(init));
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  await saveArticleSettings();
  return () => vi.unstubAllGlobals();
});

/** Piano con la scheda del progetto compilata: spoke con 3 H2 e la pilastro con il suo H1. */
async function planWithBrief(label: string) {
  const setup = await memberWithPlan(label, { projectName: PROJECT_NAME });
  await prisma.strategyPage.update({ where: { id: setup.spoke.pageId }, data: { h2: THREE_H2 } });
  await prisma.strategyPage.update({ where: { id: setup.plan.pageIds.hub }, data: { h1: PILLAR_H1 } });
  await prisma.project.update({
    where: { id: setup.spoke.projectId },
    data: { article_about: "Negozio di scarpe da corsa a Torino", article_audience: "Runner amatoriali", article_tone: "friendly" },
  });
  return setup;
}

/**
 * Avvia l'articolo ed esegue la sola fase della scaletta: con 60 s davanti il passo non ha tempo per un'altra richiesta e
 * il lavoro resta alla fase sections. Restituisce l'articolo e il corpo inviato al modello.
 */
async function generate(member: { cookie: string }, page: Parameters<typeof startArticle>[1], body: unknown) {
  const response = await startArticle(member.cookie, page, body);
  const { data } = (await response.json()) as { data: { articleId: string; runId: string } };
  expect(await advanceArticleRun(data.runId, Date.now() + 60_000)).toMatchObject({ status: "running", phase: "sections", more: true });
  const article = await prisma.article.findUniqueOrThrow({ where: { id: data.articleId }, include: { sections: { orderBy: { position: "asc" } } } });
  return { article, sent: sentBody(fetchMock.mock.calls[0][1]) };
}

describe("scaletta dell'articolo", () => {
  // covers: AC-4102-1
  it("salva meta, slug e 4 blocchi vuoti nell'ordine del piano; il corpo inviato ha scheda, note e H1 della pilastro e nessun dato riservato", async () => {
    const { member, spoke, plan } = await planWithBrief("t4102-a");

    const { article, sent } = await generate(member, spoke, { length: "MEDIUM", notes: "Consegna gratuita sopra i 50 euro" });

    expect(article.status).toBe("GENERATING");
    expect(article.meta_title).toContain("scarpe running donna");
    expect(article.meta_description).toContain("scarpe running donna");
    expect(article.slug).toBe("scarpe-running-donna");
    expect(article.sections.map((section) => [section.position, section.kind, section.heading, section.body])).toEqual([
      [0, "INTRO", null, ""],
      [1, "H2", THREE_H2[0], ""],
      [2, "H2", THREE_H2[1], ""],
      [3, "H2", THREE_H2[2], ""],
    ]);
    expect(await prisma.articleRun.findFirstOrThrow({ where: { article_id: article.id } })).toMatchObject({ progress_total: 6 });

    const data = JSON.parse(sent.messages[1].content) as SentOutlineData & Record<string, unknown>;
    expect(data).toMatchObject({
      pageType: "spoke",
      h2: THREE_H2.map((heading, index) => ({ id: `H2_${index + 1}`, heading })),
      mainKeyword: "scarpe running donna",
      secondaryKeywords: [{ keyword: "scarpe running donna ammortizzate", question: false }],
      brief: { about: "Negozio di scarpe da corsa a Torino", audience: "Runner amatoriali", tone: "friendly" },
      notes: "Consegna gratuita sopra i 50 euro",
      maxWords: 1500,
      linkablePages: [{ id: "L1", role: "pillar", h1: PILLAR_H1 }],
    });
    const raw = sent.messages.map((message) => message.content).join("\n");
    for (const forbidden of [PROJECT_NAME, "9900", "2100", "320", "volume", "score"]) {
      expect(raw).not.toContain(forbidden);
    }
    // I link della scaletta tornano con l'id della pagina pilastro del piano.
    expect((article.outline as { blocks: { links: string[] }[] }).blocks[0].links).toEqual([plan.pageIds.hub]);
  });

  it("per un piano in spagnolo del Messico le istruzioni sono in spagnolo con la variante del paese", async () => {
    const { member, spoke, plan } = await planWithBrief("t4102-b");
    await prisma.strategy.update({ where: { id: plan.strategyId }, data: { language: "es" } });
    await prisma.project.update({ where: { id: spoke.projectId }, data: { country_code: "MX" } });

    const { article, sent } = await generate(member, spoke, { length: "SHORT" });

    expect(article.status).toBe("GENERATING");
    expect(sent.messages[0].content).toContain("preparas en español de México el esquema de un artículo");
    expect(JSON.parse(sent.messages[1].content)).toMatchObject({ language: "es", maxWords: 800 });
  });

  it("per una pilastro le pagine collegabili sono i suoi spoke", async () => {
    const { member, plan } = await planWithBrief("t4102-c");
    const hub = { projectId: plan.projectId, strategyId: plan.strategyId, pageId: plan.pageIds.hub };

    const { article, sent } = await generate(member, hub, { length: "LONG" });

    expect(article.status).toBe("GENERATING");
    expect(JSON.parse(sent.messages[1].content)).toMatchObject({ pageType: "pillar", maxWords: 2500, linkablePages: [{ id: "L1", role: "spoke", h1: "H1 spoke" }] });
    expect((article.outline as { blocks: { links: string[] }[] }).blocks[0].links).toEqual([plan.pageIds.spoke]);
  });
});

describe("H2 proposti dalla scaletta (T-6503)", () => {
  // covers: AC-6503-1
  it("una pagina senza H2 riceve i 3 H2 proposti nell'ordine della risposta e strategy_pages.h2 resta vuoto", async () => {
    const { member, spoke } = await planWithBrief("t6503-a");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { h2: [] } });
    const proposed = ["Come scegliere la misura giusta", "Ammortizzazione e peso", "Quanto durano le scarpe"];
    fetchMock.mockImplementation(async (_url, init) => {
      const reply = outlineReply(sentData<SentOutlineData>(init));
      const blocks = proposed.map((heading, index) => ({ id: `NEW_${index + 1}`, heading, covers: `Argomento della sezione ${index + 1}`, keywords: [], words: 200, links: [] }));
      return modelReply({ ...reply, blocks: [reply.blocks[0], ...blocks] });
    });

    const { article, sent } = await generate(member, spoke, { length: "MEDIUM" });

    expect(sent.messages[0].content).toContain("NEW_1, NEW_2...");
    expect(JSON.parse(sent.messages[1].content)).toMatchObject({ h2: [] });
    expect(article.sections.map((section) => [section.position, section.kind, section.heading])).toEqual([
      [0, "INTRO", null],
      [1, "H2", proposed[0]],
      [2, "H2", proposed[1]],
      [3, "H2", proposed[2]],
    ]);
    expect((article.outline as { blocks: { kind: string; heading: string | null }[] }).blocks.map((block) => block.heading)).toEqual([null, ...proposed]);
    expect(await prisma.articleRun.findFirstOrThrow({ where: { article_id: article.id } })).toMatchObject({ progress_total: 6 });
    expect(await prisma.strategyPage.findUniqueOrThrow({ where: { id: spoke.pageId }, select: { h2: true, h2_edited: true } })).toEqual({ h2: [], h2_edited: false });
  });
});
