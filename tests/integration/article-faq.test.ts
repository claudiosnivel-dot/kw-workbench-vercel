// Gate di T-4202 (AC-4202-1): dopo i blocchi il lavoro di un articolo scrive le domande frequenti in un blocco finale
// FAQ, con il titolo nella lingua del piano e le domande in grassetto; la richiesta parte dalle keyword-domanda della
// pagina. In più il titolo in spagnolo, le domande dalle secondarie quando mancano le keyword-domanda, risposte non
// valide da tutti i modelli e la riscrittura del blocco FAQ con scope SECTION.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceArticleRun } from "@/lib/articles/run";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { articleCompletion, modelReply, saveArticleSettings, type SentFaqData, sentBody, sentData, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

const fetchMock = vi.fn<typeof fetch>();
const STEP_MS = 270_000;
const QUESTIONS = ["come scegliere le scarpe running donna", "quanto durano le scarpe running donna"];
const BOLD_QUESTION = /\*\*([^*]+)\*\*/g;

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

/** Articolo avviato da un MEMBER sullo spoke del piano, con le keyword-domanda indicate tra le secondarie dello spoke. */
async function spokeArticle(label: string, questions: string[] = []) {
  const setup = await memberWithPlan(label);
  await prisma.strategyKeyword.createMany({
    data: questions.map((keyword) => ({
      strategy_id: setup.plan.strategyId,
      page_id: setup.spoke.pageId,
      role: "SECONDARY" as const,
      keyword,
      canonical_keyword: keyword,
      volume: 90,
      score: 40,
      score_source: "metrics" as const,
      search_intent: "informational" as const,
      keyword_type: "generic" as const,
      is_question: true,
      is_local: false,
    })),
  });
  const response = await startArticle(setup.member.cookie, setup.spoke, { length: "MEDIUM" });
  expect(response.status).toBe(202);
  const { data } = (await response.json()) as { data: { articleId: string; runId: string } };
  return { ...setup, ...data };
}

const sectionsOf = (articleId: string) => prisma.articleSection.findMany({ where: { article_id: articleId }, orderBy: { position: "asc" } });

/** Corpi delle richieste delle FAQ catturate dal fetch simulato. */
const faqCalls = () =>
  fetchMock.mock.calls.map(([, init]) => init).filter((init) => sentData<Partial<SentFaqData>>(init).questionKeywords !== undefined);

describe("domande frequenti dell'articolo", () => {
  // covers: AC-4202-1
  it("l'ultimo blocco è FAQ con «Domande frequenti» e 4 domande in grassetto; il corpo della richiesta FAQ ha le 2 keyword-domanda", async () => {
    await saveArticleSettings();
    const { articleId, runId } = await spokeArticle("t4202-a", QUESTIONS);

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const sections = await sectionsOf(articleId);
    const faq = sections[sections.length - 1];
    expect(faq).toMatchObject({ kind: "FAQ", heading: "Domande frequenti", position: 2, edited: false, model: "autore/modello-prova:free" });
    const questions = [...faq.body.matchAll(BOLD_QUESTION)].map((match) => match[1]);
    expect(questions).toHaveLength(4);
    for (const question of questions) expect(question).toMatch(/\?$/);
    const [call] = faqCalls();
    const raw = sentBody(call).messages[1].content;
    for (const question of QUESTIONS) expect(raw).toContain(question);
    expect(sentData<SentFaqData>(call).questionKeywords.sort()).toEqual([...QUESTIONS].sort());
  });

  it("per un piano in spagnolo il blocco si intitola «Preguntas frecuentes»", async () => {
    await saveArticleSettings();
    const { plan, articleId, runId } = await spokeArticle("t4202-b");
    await prisma.strategy.update({ where: { id: plan.strategyId }, data: { language: "es" } });

    await advanceArticleRun(runId, Date.now() + STEP_MS);

    const sections = await sectionsOf(articleId);
    expect(sections[sections.length - 1]).toMatchObject({ kind: "FAQ", heading: "Preguntas frecuentes" });
    expect(sentBody(faqCalls()[0]).messages[0].content).toContain("[por verificar: …]");
  });

  it("senza keyword-domanda la richiesta porta le secondarie e le domande nascono da quelle", async () => {
    await saveArticleSettings();
    const { articleId, runId } = await spokeArticle("t4202-c");

    await advanceArticleRun(runId, Date.now() + STEP_MS);

    expect(sentData<SentFaqData>(faqCalls()[0])).toMatchObject({ questionKeywords: [], otherKeywords: ["scarpe running donna ammortizzate"] });
    const faq = (await sectionsOf(articleId)).at(-1);
    expect([...(faq?.body ?? "").matchAll(BOLD_QUESTION)]).toHaveLength(4);
  });

  it("con domande frequenti non valide da tutti i modelli il lavoro è failed con AI_INVALID_RESPONSE e i blocchi restano scritti", async () => {
    await saveArticleSettings({ models: ["autore/modello-a:free", "autore/modello-b:free"] });
    const { articleId, runId } = await spokeArticle("t4202-d");
    fetchMock.mockImplementation(async (_url, init) => {
      if (sentData<Partial<SentFaqData>>(init).questionKeywords === undefined) return articleCompletion(init);
      return modelReply({ faq: [{ question: "Una sola domanda?", answer: "Troppo breve." }] });
    });

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "failed" });

    expect(await prisma.articleRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: "failed", error_code: "AI_INVALID_RESPONSE" });
    expect(await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).toMatchObject({ status: "FAILED", error_code: "AI_INVALID_RESPONSE" });
    const sections = await sectionsOf(articleId);
    expect(sections.map((section) => section.kind)).toEqual(["INTRO", "H2"]);
    expect(faqCalls()).toHaveLength(2);
  });

  it("con scope SECTION sul blocco FAQ riscrive solo quel blocco, con l'istruzione dell'autore tra i dati", async () => {
    await saveArticleSettings();
    const { owner, articleId, runId } = await spokeArticle("t4202-e", QUESTIONS);
    await advanceArticleRun(runId, Date.now() + STEP_MS);
    const before = await sectionsOf(articleId);
    const faq = before[before.length - 1];
    await prisma.articleSection.update({ where: { id: faq.id }, data: { body: "Domande scritte dall'autore.", edited: true } });
    const rewrite = await prisma.articleRun.create({
      data: { article_id: articleId, workspace_id: owner.workspaceId, scope: "SECTION", section_id: faq.id, instruction: "Più domande sui resi", phase: "sections" },
    });
    fetchMock.mockClear();

    expect(await advanceArticleRun(rewrite.id, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const after = await sectionsOf(articleId);
    expect(after[after.length - 1]).toMatchObject({ id: faq.id, kind: "FAQ", heading: "Domande frequenti", edited: false });
    expect([...after[after.length - 1].body.matchAll(BOLD_QUESTION)]).toHaveLength(4);
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentData<SentFaqData>(faqCalls()[0]).instruction).toBe("Più domande sui resi");
  });
});
