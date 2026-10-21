// Gate di T-5202 (AC-5202-1): un blocco con più parole del tetto della scaletta compare nel rapporto SEO con il problema
// words_over e non si riscrive: il tetto si segnala all'autore, non è un motivo di riscrittura.
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
/**
 * Blocco H2 di 130 parole (13 frasi da 10) senza la keyword principale, senza formule tipiche e con aperture tutte
 * diverse: nessun tratto AI e nessun problema SEO, solo più parole delle 100 della scaletta.
 */
const LONG_BLOCK = [
  "Prima di ogni uscita conviene scaldare bene caviglie e ginocchia.",
  "Una camminata veloce prepara il corpo allo sforzo della corsa.",
  "Chi comincia da poco dovrebbe alternare tratti lenti e pause.",
  "Il respiro deve restare regolare anche quando la strada sale.",
  "Bere qualche sorso di acqua aiuta nelle giornate più calde.",
  "Dopo la corsa bastano pochi minuti di allungamento molto lento.",
  "Sul terreno sterrato il passo va accorciato per non scivolare.",
  "Ascoltare i segnali del corpo evita molti piccoli infortuni fastidiosi.",
  "Riposare almeno un giorno alla settimana fa bene alle gambe.",
  "Anche il sonno conta per recuperare le energie spese correndo.",
  "Molti preferiscono uscire presto, quando le strade sono più tranquille.",
  "Un diario degli allenamenti mostra i progressi fatti nel tempo.",
  "Correre in compagnia rende più facile mantenere la costanza giusta.",
].join(" ");

type StoredReport = { blocks: { position: number; problems: { rule: string; count?: number; max?: number }[] }[] };

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
  // La scaletta simulata dà 100 parole a ogni blocco; il blocco H2_1 si scrive con LONG_BLOCK.
  fetchMock.mockImplementation(async (_url, init) => {
    const data = sentData<Partial<SentSectionData>>(init);
    return data.block?.id === "H2_1" ? modelReply(LONG_BLOCK) : articleCompletion(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** Dati delle richieste del blocco H2_1 catturate dal fetch simulato, nell'ordine. */
const firstBlockCalls = () => fetchMock.mock.calls.map(([, init]) => sentData<Partial<SentSectionData>>(init)).filter((data) => data.block?.id === "H2_1");

describe("tetto di parole del blocco nel rapporto SEO", () => {
  // covers: AC-5202-1
  it("un blocco H2 di 130 parole su 100 della scaletta ha words_over nel rapporto e si chiede al modello una volta sola", async () => {
    await saveArticleSettings();
    const { member, spoke } = await memberWithPlan("t5202-a");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { h2: TWO_H2 } });
    const response = await startArticle(member.cookie, spoke, { length: "MEDIUM" });
    expect(response.status).toBe(202);
    const { data } = (await response.json()) as { data: { articleId: string; runId: string } };

    expect(await advanceArticleRun(data.runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const article = await prisma.article.findUniqueOrThrow({ where: { id: data.articleId } });
    expect(article.status).toBe("READY");
    const report = article.seo_report as StoredReport;
    expect(report.blocks).toContainEqual({ position: 1, problems: [{ rule: "words_over", count: 130, max: 100 }] });
    // Gli altri blocchi stanno nel tetto; il blocco FAQ, fuori dalla scaletta, non ne ha.
    expect(report.blocks.filter((block) => block.problems.some((problem) => problem.rule === "words_over")).map((block) => block.position)).toEqual([1]);
    expect(firstBlockCalls()).toHaveLength(1);
  });
});
