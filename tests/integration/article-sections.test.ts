// Gate di T-4201 (AC-4201-1): dopo la scaletta il lavoro di un articolo scrive i blocchi, uno per richiesta e
// nell'ordine, con il link alla pagina pilastro nell'introduzione e una riga di ai_requests per richiesta. In più i dati
// inviati per un blocco, l'introduzione senza la keyword principale scartata (la scrive il modello successivo) e la
// riscrittura di un solo blocco con scope SECTION e l'istruzione dell'autore.
// impacted-by: T-4302 (i controlli riscrivono un'introduzione senza il link obbligatorio alla pilastro: il testo del
// modello successivo ora lo contiene, così l'introduzione non si riscrive)
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceArticleRun } from "@/lib/articles/run";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { articleCompletion, modelReply, saveArticleSettings, type SentSectionData, sentBody, sentData, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

const fetchMock = vi.fn<typeof fetch>();
const TWO_H2 = ["Come scegliere la taglia", "Quanto durano"];
const STEP_MS = 270_000;
const MODEL_A = "autore/modello-a:free";
const MODEL_B = "autore/modello-b:free";

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
  return () => vi.unstubAllGlobals();
});

/** Articolo MEDIUM avviato da un MEMBER su uno spoke con 2 H2: la scaletta ha INTRO e 2 H2, la pilastro nell'INTRO. */
async function spokeArticle(label: string) {
  const setup = await memberWithPlan(label);
  await prisma.strategyPage.update({ where: { id: setup.spoke.pageId }, data: { h2: TWO_H2 } });
  const response = await startArticle(setup.member.cookie, setup.spoke, { length: "MEDIUM" });
  expect(response.status).toBe(202);
  const { data } = (await response.json()) as { data: { articleId: string; runId: string } };
  return { ...setup, ...data };
}

const sectionsOf = (articleId: string) => prisma.articleSection.findMany({ where: { article_id: articleId }, orderBy: { position: "asc" } });

/** Dati delle richieste dei blocchi catturate dal fetch simulato, nell'ordine. */
const sectionCalls = () =>
  fetchMock.mock.calls.map(([, init]) => sentData<Partial<SentSectionData>>(init)).filter((data): data is SentSectionData => data.block !== undefined);

describe("scrittura dei blocchi dell'articolo", () => {
  // covers: AC-4201-1
  it("scrive i 3 blocchi della scaletta nell'ordine, con il link alla pilastro nell'introduzione, e ogni richiesta ha la sua riga ok", async () => {
    await saveArticleSettings();
    const { plan, articleId, runId } = await spokeArticle("t4201-a");

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed", more: false });

    const blocks = (await sectionsOf(articleId)).filter((section) => section.kind !== "FAQ");
    expect(blocks.map((section) => [section.position, section.kind, section.heading])).toEqual([
      [0, "INTRO", null],
      [1, "H2", TWO_H2[0]],
      [2, "H2", TWO_H2[1]],
    ]);
    for (const block of blocks) {
      expect(block.body.trim()).not.toBe("");
      expect(block).toMatchObject({ model: "autore/modello-prova:free", edited: false });
    }
    expect(blocks[0].body).toContain(`(page:${plan.pageIds.hub})`);
    expect(sectionCalls().map((data) => data.block.id)).toEqual(["INTRO", "H2_1", "H2_2"]);
    // Scaletta, 3 blocchi e la richiesta delle FAQ di T-4202 (AC-4201-1 emendato).
    const requests = await prisma.aiRequest.findMany({ select: { feature: true, outcome: true } });
    expect(requests).toEqual(Array.from({ length: 5 }, () => ({ feature: "article", outcome: "ok" })));
    expect(await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).toMatchObject({ status: "READY", error_code: null });
    expect(await prisma.articleRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ progress_done: 5, progress_total: 5 });
  });

  it("ogni blocco riceve la scaletta intera, le sue keyword, il suo tetto di parole e le sue pagine da collegare", async () => {
    await saveArticleSettings();
    const { runId } = await spokeArticle("t4201-b");

    await advanceArticleRun(runId, Date.now() + STEP_MS);

    const [intro, first] = sectionCalls();
    expect(intro.outline.map((block) => [block.id, block.heading])).toEqual([
      ["INTRO", null],
      ["H2_1", TWO_H2[0]],
      ["H2_2", TWO_H2[1]],
    ]);
    expect(intro.block).toMatchObject({ id: "INTRO", keywords: ["scarpe running donna"], maxWords: 100, links: [{ target: "page:L1", h1: "H1 hub" }] });
    expect(first.block).toMatchObject({ id: "H2_1", heading: TWO_H2[0], keywords: [], maxWords: 100, links: [] });
    expect(intro).not.toHaveProperty("instruction");
  });

  it("un'introduzione senza la keyword principale è scartata e la scrive il modello successivo", async () => {
    await saveArticleSettings({ models: [MODEL_A, MODEL_B] });
    const { plan, articleId, runId } = await spokeArticle("t4201-c");
    const valid = "Le scarpe running da donna giuste cambiano la corsa: leggi [la guida](page:L1).";
    fetchMock.mockImplementation(async (_url, init) => {
      const { model } = sentBody(init);
      if (sentData<Partial<SentSectionData>>(init).block?.id !== "INTRO") return articleCompletion(init);
      return modelReply(model === MODEL_A ? "Un testo che parla d'altro dall'inizio alla fine." : valid, model);
    });

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const [intro] = await sectionsOf(articleId);
    expect(intro).toMatchObject({
      kind: "INTRO",
      model: MODEL_B,
      body: `Le scarpe running da donna giuste cambiano la corsa: leggi [la guida](page:${plan.pageIds.hub}).`,
    });
    expect(await prisma.aiRequest.count({ where: { model: MODEL_A, outcome: "invalid_response" } })).toBe(1);
  });
});

describe("riscrittura di un blocco", () => {
  it("con scope SECTION riscrive solo il blocco del lavoro, con l'istruzione dell'autore tra i dati, e lo riporta a edited false", async () => {
    await saveArticleSettings();
    const { owner, articleId, runId } = await spokeArticle("t4201-d");
    await advanceArticleRun(runId, Date.now() + STEP_MS);
    const target = (await sectionsOf(articleId))[1];
    await prisma.articleSection.update({ where: { id: target.id }, data: { body: "Testo scritto dall'autore.", edited: true } });
    const before = await sectionsOf(articleId);
    const rewrite = await prisma.articleRun.create({
      data: {
        article_id: articleId,
        workspace_id: owner.workspaceId,
        scope: "SECTION",
        section_id: target.id,
        instruction: "Aggiungi un esempio con le scarpe da trail",
        phase: "sections",
        progress_total: 1,
      },
    });
    fetchMock.mockClear();

    expect(await advanceArticleRun(rewrite.id, Date.now() + STEP_MS)).toMatchObject({ status: "completed", more: false });

    const after = await sectionsOf(articleId);
    expect(after[1]).toMatchObject({ id: target.id, edited: false, model: "autore/modello-prova:free" });
    expect(after[1].body).not.toBe("Testo scritto dall'autore.");
    expect(after.filter((section) => section.id !== target.id)).toEqual(before.filter((section) => section.id !== target.id));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sectionCalls()).toMatchObject([{ block: { id: "H2_1", heading: TWO_H2[0] }, instruction: "Aggiungi un esempio con le scarpe da trail" }]);
    expect(await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).toMatchObject({ status: "READY" });
  });
});
