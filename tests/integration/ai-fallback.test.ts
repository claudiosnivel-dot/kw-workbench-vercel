// Gate di T-3802 (AC-3802-1…5): la proposta dei titoli con l'AI prova i modelli dell'elenco in ordine, passa al
// successivo quando il fornitore è occupato o la risposta non supera il controllo, si ferma al limite giornaliero
// dell'account, risponde 503 AI_BUSY con i modelli tutti occupati e conta gli H2 tenuti fuori oltre il massimo.
import { randomBytes } from "node:crypto";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApiErrorMessage } from "@/lib/client/http";
import { prisma } from "@/lib/prisma";
import itMessages from "@/messages/it.json";
import { completion, memberWithPlan, pageRow, saveAiSettings, stubOpenRouterEnv, suggest } from "../helpers/ai-titles";
import { resetDatabase } from "../helpers/db";

type SuggestBody = { data?: { h1: string; h2: string[]; droppedH2: number; model: string }; code?: string; error?: string };
type Attempt = { model: string; outcome: string; httpStatus: number | null };

const A = "autore/a:free";
const B = "autore/b:free";
const C = "autore/c:free";
const H1 = "Scarpe running donna: come sceglierle";
const SAVED = { h1: "Scarpe running donna: guida", h2: ["Taglie"], model: A, createdAt: "2026-10-17T08:00:00.000Z" };

const fetchMock = vi.fn<typeof fetch>();

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("LOG_LEVEL", "info");
  // app_settings è cifrata: una chiave casuale di test.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  stubOpenRouterEnv();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  await resetDatabase();
  return () => vi.unstubAllGlobals();
});

/** 429 del fornitore sovraccarico, nel formato di OpenRouter: il fornitore nei metadati dell'errore. */
const providerBusy = () =>
  Response.json(
    { error: { code: 429, message: "Provider returned error", metadata: { provider_name: "Google AI Studio", raw: "rate-limited upstream" } } },
    { status: 429 }
  );

/** 429 del limite giornaliero dei modelli gratuiti dell'account. */
const dailyLimit = () =>
  Response.json(
    {
      error: {
        code: 429,
        message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day",
        metadata: { headers: { "X-RateLimit-Limit": "50", "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(Date.now() + 8 * 3_600_000) } },
      },
    },
    { status: 429 }
  );

const sentModels = () => fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { model: string }).model);

/** Esegue la proposta catturando le righe del log ai_titles_suggest. */
async function suggestWithLog(cookie: string, page: Parameters<typeof suggest>[1]) {
  const lines: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  const response = await suggest(cookie, page).finally(() => stdout.mockRestore());
  const entry = lines
    .filter((line) => line.includes('"msg":"ai_titles_suggest"'))
    .map((line) => JSON.parse(line) as { attempts?: Attempt[] })
    .at(0);
  return { response, body: (await response.json()) as SuggestBody, attempts: entry?.attempts ?? null, lines };
}

describe("proposta con i modelli di riserva", () => {
  // covers: AC-3802-1
  it("dopo il fornitore occupato risponde il modello successivo; il log ha i tentativi senza messaggi del fornitore", async () => {
    await saveAiSettings({ models: [A, B, C] });
    const { member, spoke } = await memberWithPlan("t3802");
    fetchMock.mockResolvedValueOnce(providerBusy()).mockResolvedValueOnce(completion({ h1: H1, h2: ["Ammortizzazione"] }, B));

    const { response, body, attempts, lines } = await suggestWithLog(member.cookie, spoke);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ h1: H1, model: B });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentModels()).toEqual([A, B]);
    expect(attempts).toEqual([
      { model: A, outcome: "provider_busy", httpStatus: 429 },
      { model: B, outcome: "ok", httpStatus: 200 },
    ]);
    expect(lines.filter((line) => line.includes("Google AI Studio") || line.includes("rate-limited"))).toEqual([]);
    expect((await pageRow(spoke.pageId)).ai_proposal).toMatchObject({ model: B, droppedH2: 0 });
  });

  // covers: AC-3802-2
  it("una risposta che non supera il controllo passa al modello successivo", async () => {
    await saveAiSettings({ models: [A, B] });
    const { member, spoke } = await memberWithPlan("t3802");
    const noJson = Response.json({ model: A, choices: [{ message: { content: "Ecco alcune idee per i titoli della pagina." } }] });
    fetchMock.mockResolvedValueOnce(noJson).mockResolvedValueOnce(completion({ h1: H1, h2: ["Ammortizzazione"] }, B));

    const { response, body, attempts } = await suggestWithLog(member.cookie, spoke);

    expect(response.status).toBe(200);
    expect(body.data?.model).toBe(B);
    expect(attempts?.[0]).toEqual({ model: A, outcome: "invalid_response", httpStatus: 200 });
  });

  // covers: AC-3802-3
  it("al limite giornaliero dell'account risponde 429 AI_DAILY_LIMIT senza provare gli altri e lascia la proposta salvata", async () => {
    await saveAiSettings({ models: [A, B, C] });
    const { member, spoke } = await memberWithPlan("t3802");
    await prisma.strategyPage.update({ where: { id: spoke.pageId }, data: { ai_proposal: SAVED } });
    fetchMock.mockImplementation(async () => dailyLimit());

    const { response, body, attempts } = await suggestWithLog(member.cookie, spoke);

    expect([response.status, body.code]).toEqual([429, "AI_DAILY_LIMIT"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([{ model: A, outcome: "account_daily_limit", httpStatus: 429 }]);
    expect((await pageRow(spoke.pageId)).ai_proposal).toEqual(SAVED);
  });

  // covers: AC-3802-4
  it("con i modelli tutti occupati risponde 503 AI_BUSY dopo tre chiamate, con il messaggio dei modelli occupati", async () => {
    await saveAiSettings({ models: [A, B, C] });
    const { member, spoke } = await memberWithPlan("t3802");
    fetchMock.mockImplementation(async () => providerBusy());

    const { response, body } = await suggestWithLog(member.cookie, spoke);
    // Lo stesso messaggio che il pannello mostra per la risposta (buildApiErrorMessage di usePlanRequests).
    const message = buildApiErrorMessage(response, { error: body.error ?? "", code: body.code }, createTranslator({ locale: "it", messages: itMessages, namespace: "errors" }));

    expect([response.status, body.code]).toEqual([503, "AI_BUSY"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentModels()).toEqual([A, B, C]);
    expect(message).toBe("I modelli gratuiti sono tutti occupati: riprova tra qualche minuto.");
  });

  // covers: AC-3802-5
  it("oltre i 12 H2 dello spoke salva i primi 12 e conta i 2 tenuti fuori", async () => {
    await saveAiSettings({ models: [A] });
    const { member, spoke } = await memberWithPlan("t3802");
    const fourteen = Array.from({ length: 14 }, (_, index) => `Argomento numero ${index + 1}`);
    fetchMock.mockResolvedValueOnce(completion({ h1: H1, h2: fourteen }, A));

    const { response, body } = await suggestWithLog(member.cookie, spoke);
    const saved = (await pageRow(spoke.pageId)).ai_proposal as { h2: string[]; droppedH2: number };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ h2: fourteen.slice(0, 12), droppedH2: 2 });
    expect(saved.h2).toEqual(fourteen.slice(0, 12));
    expect(saved.droppedH2).toBe(2);
  });
});
