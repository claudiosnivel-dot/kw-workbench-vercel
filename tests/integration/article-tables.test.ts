// Gate di T-5501 (AC-5501-1): il blocco scritto dal modello con un paragrafo e una tabella semplice arriva alla fine del
// lavoro con la tabella nel testo salvato, intestazione, riga di separazione e righe nello stesso ordine.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceArticleRun } from "@/lib/articles/run";
import { prisma } from "@/lib/prisma";
import { memberWithPlan, stubOpenRouterEnv } from "../helpers/ai-titles";
import { articleCompletion, modelReply, saveArticleSettings, type SentSectionData, sentData, startArticle } from "../helpers/articles";
import { resetDatabase } from "../helpers/db";

const fetchMock = vi.fn<typeof fetch>();
const TWO_H2 = ["Come scegliere il modello", "Quanto durano"];
const STEP_MS = 270_000;
/** Paragrafo senza formule tipiche né aperture ripetute, poi una tabella di 3 colonne con 4 righe di dati. */
const PARAGRAPH = "Il peso conta più del colore quando si sceglie una scarpa per correre su strada o sui sentieri.";
const TABLE = [
  "| Modello | Peso | Uso |",
  "| --- | --- | --- |",
  "| Leggera | 220 g | gare su strada |",
  "| Ammortizzata | 280 g | lunghe distanze |",
  "| Trail | 300 g | sentieri |",
  "| Minimalista | 180 g | tecnica di corsa |",
].join("\n");

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
  // Il blocco H2_1 si scrive con il paragrafo e la tabella; scaletta, altri blocchi e FAQ come negli altri test.
  fetchMock.mockImplementation(async (_url, init) => {
    const data = sentData<Partial<SentSectionData>>(init);
    return data.block?.id === "H2_1" ? modelReply(`${PARAGRAPH}\n\n${TABLE}`) : articleCompletion(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

describe("tabelle nel testo dei blocchi", () => {
  // covers: AC-5501-1
  it("il blocco H2_1 con un paragrafo e una tabella di 3 colonne e 4 righe si salva con la tabella intera, senza riscritture", async () => {
    await saveArticleSettings();
    const { member, spoke } = await memberWithPlan("t5501-a");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { h2: TWO_H2 } });
    const response = await startArticle(member.cookie, spoke, { length: "MEDIUM" });
    expect(response.status).toBe(202);
    const { data } = (await response.json()) as { data: { articleId: string; runId: string } };

    expect(await advanceArticleRun(data.runId, Date.now() + STEP_MS)).toMatchObject({ status: "completed" });

    const article = await prisma.article.findUniqueOrThrow({ where: { id: data.articleId } });
    expect(article.status).toBe("READY");
    const section = await prisma.articleSection.findFirstOrThrow({ where: { article_id: data.articleId, position: 1 } });
    expect(section.body).toBe(`${PARAGRAPH}\n\n${TABLE}`);
    const blockCalls = fetchMock.mock.calls.map(([, init]) => sentData<Partial<SentSectionData>>(init)).filter((sent) => sent.block?.id === "H2_1");
    expect(blockCalls).toHaveLength(1);
  });
});
