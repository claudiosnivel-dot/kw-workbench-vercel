// Gate di T-3502 (AC-3502-1…4): richiesta al modello con i soli dati ammessi, controllo della risposta e client di
// OpenRouter con il timeout.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiTitlesError } from "@/lib/ai/errors";
import { requestCompletion } from "@/lib/ai/openrouter";
import { buildTitlesRequest } from "@/lib/ai/titles-prompt";
import { parseTitlesResponse } from "@/lib/ai/titles-response";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

/** Keyword del piano come le legge l'editor: oltre al testo anche volume e punteggio, che non devono partire. */
function plannedKeyword(text: string, volume: number | null, isQuestion = false) {
  return { keyword: text, canonical: canonicalizeKeyword(text, "it"), isQuestion, volume, score: 61 };
}

// Spoke di AC-3502-1: la variabile porta anche il nome del progetto, come una lettura dal database.
const spoke = {
  kind: "SPOKE" as const,
  contentType: "guide" as const,
  main: plannedKeyword("scarpe running donna", null),
  secondary: [plannedKeyword("come scegliere scarpe running", 4400, true), plannedKeyword("scarpe running ammortizzate", 880)],
  projectName: "Cliente-Segreto-XYZ",
};

function invalidResponse(content: string): unknown {
  try {
    parseTitlesResponse(content, spoke, "it");
  } catch (error) {
    return error;
  }
  return null;
}

describe("richiesta al modello", () => {
  // covers: AC-3502-1
  it("contiene principale, secondarie in ordine e il massimo di H2, senza nome del progetto né volumi", () => {
    const serialized = JSON.stringify(buildTitlesRequest(spoke, { language: "it", model: "autore/modello:free" }));

    const main = serialized.indexOf("scarpe running donna");
    const first = serialized.indexOf("come scegliere scarpe running");
    const second = serialized.indexOf("scarpe running ammortizzate");
    expect(main).toBeGreaterThanOrEqual(0);
    expect(first).toBeGreaterThan(main);
    expect(second).toBeGreaterThan(first);
    // Numero intero 12, non una parte di 1200 (max_tokens).
    expect(serialized).toMatch(/\b12\b/);
    expect(serialized).not.toContain("Cliente-Segreto-XYZ");
    expect(serialized).not.toContain("4400");
    expect(serialized).not.toContain("880");
  });

  it("per la pilastro manda anche le principali degli spoke e il massimo di 20 H2", () => {
    const hub = { ...spoke, kind: "HUB" as const, spokeMains: [plannedKeyword("scarpe trail running", 1300)] };

    const request = buildTitlesRequest(hub, { language: "de", model: "autore/modello:free" });
    const serialized = JSON.stringify(request);

    expect(serialized).toContain("scarpe trail running");
    expect(serialized).toMatch(/\b20\b/);
    expect(request.messages[0].content).toContain("German");
  });
});

describe("controllo della risposta", () => {
  // covers: AC-3502-2
  it("estrae il JSON dal blocco di codice, ripulisce i titoli e toglie i doppioni", () => {
    const content = [
      "Ecco i titoli:",
      "```json",
      JSON.stringify({ h1: "# Scarpe running donna: come sceglierle", h2: ["Ammortizzazione", "ammortizzazione", "<b>Taglie</b>"] }),
      "```",
    ].join("\n");

    expect(parseTitlesResponse(content, spoke, "it")).toEqual({
      h1: "Scarpe running donna: come sceglierle",
      h2: ["Ammortizzazione", "Taglie"],
    });
  });

  // covers: AC-3502-3
  // impacted-by: T-3601 (D-43: gli H2 oltre il massimo si tengono nei primi, AC-3601-6 sulla rotta)
  it("rifiuta una risposta senza JSON, un H1 senza la principale e H2 vuoti", () => {
    const h1 = "Scarpe running donna: guida";
    const responses = [
      "Non posso aiutarti con questa richiesta.",
      JSON.stringify({ h1: "Le migliori calzature", h2: ["Ammortizzazione"] }),
      JSON.stringify({ h1, h2: [] }),
      JSON.stringify({ h1, h2: ["   "] }),
    ];

    for (const content of responses) {
      const error = invalidResponse(content);
      expect(error).toBeInstanceOf(AiTitlesError);
      expect(error).toMatchObject({ code: "AI_INVALID_RESPONSE" });
    }
  });
});

describe("client di OpenRouter", () => {
  const fetchMock = vi.fn<typeof fetch>();
  // Chiave generata a ogni esecuzione: nessun valore simile a un segreto nel sorgente.
  const options = { apiKey: randomUUID(), baseUrl: "https://openrouter.test/api/v1", timeoutMs: 20_000 };
  const body = buildTitlesRequest(spoke, { language: "it", model: "autore/modello:free" });

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // covers: AC-3502-4
  it("timeout, risposta non riuscita e risposta valida", async () => {
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const silent = expect(requestCompletion(body, options)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(20_000);
    await silent;

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    const limited = expect(requestCompletion(body, options)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(20_000);
    await limited;

    fetchMock.mockResolvedValueOnce(Response.json({ model: "autore/modello:free", choices: [{ message: { content: "ok" } }] }));
    await expect(requestCompletion(body, options)).resolves.toEqual({ content: "ok", model: "autore/modello:free" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toBe("https://openrouter.test/api/v1/chat/completions");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${options.apiKey}`);
  });
});
