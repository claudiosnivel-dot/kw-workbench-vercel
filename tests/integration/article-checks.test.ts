// Gate di T-4302 (AC-4302-3, AC-4302-4): dopo le domande frequenti il lavoro di un articolo controlla ogni blocco e
// riscrive una volta, con l'elenco dei problemi, il blocco che supera la soglia dei tratti AI; i problemi rimasti vanno
// nel rapporto SEO dell'articolo. In più un blocco modificato dall'autore che non si riscrive e la riscrittura di un
// solo blocco con scope SECTION, con il rapporto ricalcolato sull'intero articolo.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceArticleRun } from "@/lib/articles/run";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { articleCompletion, modelReply, saveArticleSettings, type SentSectionData, sentData, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

const fetchMock = vi.fn<typeof fetch>();
const TWO_H2 = ["Come scegliere la taglia", "Quanto durano"];
const STEP_MS = 270_000;
/** Blocco H2 con tre formule tipiche dei testi generati. */
const THREE_PATTERNS = "In conclusione, è importante sottolineare che la taglia giusta conta. Al giorno d'oggi chi corre sceglie con calma.";
/** Lo stesso blocco con due formule tipiche: in un blocco breve superano ancora la soglia. */
const TWO_PATTERNS = "In conclusione, la taglia giusta conta. Al giorno d'oggi chi corre sceglie con calma.";
/** Lo stesso blocco senza formule tipiche. */
const CLEAN = "La taglia giusta conta: chi corre sceglie con calma e prova le scarpe prima di comprarle.";

type SentRewrite = SentSectionData & { problems?: { rule: string; text?: string }[] };
type StoredChecks = { matches: { kind: string; rule: string }[]; overLimit: boolean };
type StoredReport = { blocks: { position: number; problems: { rule: string }[] }[] };

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

/** OpenRouter simulato: il blocco H2_1 è first alla prima stesura e rewrite quando la richiesta porta i problemi. */
function writeFirstBlock(first: string, rewrite: string) {
  fetchMock.mockImplementation(async (_url, init) => {
    const data = sentData<Partial<SentRewrite>>(init);
    if (data.block?.id !== "H2_1") return articleCompletion(init);
    return modelReply(data.problems ? rewrite : first);
  });
}

/** Dati delle richieste del blocco H2_1 catturate dal fetch simulato, nell'ordine. */
const firstBlockCalls = () => fetchMock.mock.calls.map(([, init]) => sentData<Partial<SentRewrite>>(init)).filter((data) => data.block?.id === "H2_1");

const sectionAt = (articleId: string, position: number) =>
  prisma.articleSection.findUniqueOrThrow({ where: { article_id_position: { article_id: articleId, position } } });

const aiPatterns = (checks: unknown) => (checks as StoredChecks).matches.filter((match) => match.kind === "ai_pattern");

async function seoReport(articleId: string): Promise<StoredReport> {
  return (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).seo_report as StoredReport;
}

describe("controlli e riscrittura dei blocchi", () => {
  // covers: AC-4302-3
  it("un blocco H2 con tre formule tipiche si riscrive una volta: il testo salvato e i suoi controlli non hanno formule", async () => {
    await saveArticleSettings();
    const { articleId, runId } = await spokeArticle("t4302-a");
    writeFirstBlock(THREE_PATTERNS, CLEAN);

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    expect(firstBlockCalls()).toHaveLength(2);
    const block = await sectionAt(articleId, 1);
    expect(block.body).toBe(CLEAN);
    expect(aiPatterns(block.checks)).toEqual([]);
    expect(await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).toMatchObject({ status: "READY" });
  });

  // covers: AC-4302-4
  it("se anche la riscrittura ha due formule il blocco non si richiede una terza volta e il rapporto lo elenca con i tratti AI", async () => {
    await saveArticleSettings();
    const { articleId, runId } = await spokeArticle("t4302-b");
    writeFirstBlock(THREE_PATTERNS, TWO_PATTERNS);

    expect(await advanceArticleRun(runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    expect(firstBlockCalls()).toHaveLength(2);
    expect(await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).toMatchObject({ status: "READY", error_code: null });
    expect((await seoReport(articleId)).blocks).toContainEqual({ position: 1, problems: [expect.objectContaining({ rule: "ai_patterns" })] });
    expect((await sectionAt(articleId, 1)).body).toBe(TWO_PATTERNS);
  });

  it("la riscrittura riceve i tratti trovati nella prima stesura; i blocchi senza problemi non si richiedono di nuovo", async () => {
    await saveArticleSettings();
    const { articleId, runId } = await spokeArticle("t4302-c");
    writeFirstBlock(THREE_PATTERNS, CLEAN);

    await advanceArticleRun(runId, Date.now() + STEP_MS);

    const [first, rewrite] = firstBlockCalls();
    expect(first).not.toHaveProperty("problems");
    expect(rewrite.problems).toEqual(
      expect.arrayContaining([
        { rule: "phrase", text: "In conclusione" },
        { rule: "phrase", text: "è importante sottolineare" },
        { rule: "phrase", text: "Al giorno d'oggi" },
      ])
    );
    // Scaletta, 3 blocchi, la riscrittura di H2_1 e le FAQ.
    expect(await prisma.aiRequest.count()).toBe(6);
    const sections = await prisma.articleSection.findMany({ where: { article_id: articleId }, orderBy: { position: "asc" } });
    for (const section of sections) expect(section.checks).toMatchObject({ overLimit: false });
  });

  it("un blocco modificato dall'autore non si riscrive: i suoi controlli e il rapporto riportano i tratti", async () => {
    await saveArticleSettings();
    const { owner, articleId, runId } = await spokeArticle("t4302-d");
    await advanceArticleRun(runId, Date.now() + STEP_MS);
    const block = await sectionAt(articleId, 1);
    await prisma.articleSection.update({ where: { id: block.id }, data: { body: THREE_PATTERNS, edited: true } });
    const checks = await prisma.articleRun.create({ data: { article_id: articleId, workspace_id: owner.workspaceId, scope: "ARTICLE", phase: "checks" } });
    fetchMock.mockClear();

    expect(await advanceArticleRun(checks.id, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    expect(fetchMock).not.toHaveBeenCalled();
    const after = await sectionAt(articleId, 1);
    expect(after).toMatchObject({ body: THREE_PATTERNS, edited: true });
    expect(aiPatterns(after.checks)).toHaveLength(3);
    expect((await seoReport(articleId)).blocks).toContainEqual({ position: 1, problems: [expect.objectContaining({ rule: "ai_patterns" })] });
  });

  it("con scope SECTION controlla e riscrive solo il blocco del lavoro e ricalcola il rapporto sull'intero articolo", async () => {
    await saveArticleSettings();
    const { owner, articleId, runId } = await spokeArticle("t4302-e");
    writeFirstBlock(CLEAN, CLEAN);
    await advanceArticleRun(runId, Date.now() + STEP_MS);
    const target = await sectionAt(articleId, 1);
    const otherBefore = await sectionAt(articleId, 2);
    await prisma.articleSection.update({ where: { id: otherBefore.id }, data: { body: TWO_PATTERNS, edited: true } });
    const rewrite = await prisma.articleRun.create({
      data: { article_id: articleId, workspace_id: owner.workspaceId, scope: "SECTION", section_id: target.id, instruction: "Più esempi", phase: "sections" },
    });
    writeFirstBlock(THREE_PATTERNS, CLEAN);
    fetchMock.mockClear();

    expect(await advanceArticleRun(rewrite.id, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstBlockCalls().map((data) => data.instruction)).toEqual(["Più esempi", "Più esempi"]);
    expect(await sectionAt(articleId, 1)).toMatchObject({ body: CLEAN, edited: false });
    // Il blocco 2, cambiato dopo i controlli del lavoro dell'articolo, conserva i suoi controlli ma entra nel rapporto.
    expect((await sectionAt(articleId, 2)).checks).toEqual(otherBefore.checks);
    expect((await seoReport(articleId)).blocks).toContainEqual({ position: 2, problems: [expect.objectContaining({ rule: "ai_patterns" })] });
  });
});
