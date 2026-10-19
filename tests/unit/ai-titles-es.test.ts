// Gate di T-5102 (AC-5102-1, AC-5102-2): istruzioni al modello in spagnolo con la variante del paese della strategia
// (Spagna, paese d'America Latina, spagnolo neutro per gli altri) e H1 della risposta accettato con «¿», accenti e
// parole vuote diversi dalla keyword principale.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestPageTitles } from "@/lib/ai/suggest";
import { parseTitlesResponse } from "@/lib/ai/titles-response";
import { canonicalizeKeyword } from "@/lib/modules/normalization";
import { readPlanTitlePage } from "@/lib/modules/strategy/service";
import type { TitleKeyword, TitlePage } from "@/lib/modules/strategy/titles";

// Il test unitario non ha il DB: accesso al progetto (un MEMBER), pagina del piano, impostazioni, limiti e registro delle
// richieste sono simulati; il paese letto dal progetto e dalla sezione lo prova tests/integration/ai-titles-suggest.test.ts.
vi.mock("@/lib/authz/workspace", () => ({
  requireProjectAccess: vi.fn(async (_actor: unknown, projectId: string) => ({
    id: projectId,
    workspace_id: "workspace-prueba",
    role: "MEMBER",
    perimeter: {},
  })),
}));
vi.mock("@/lib/modules/strategy/service", () => ({
  requirePlanPage: vi.fn(async () => {}),
  readPlanTitlePage: vi.fn(),
  savePageAiProposal: vi.fn(async () => {}),
}));
vi.mock("@/lib/ai/settings", () => ({
  getAiTitlesSettings: vi.fn(async () => ({
    enabled: true,
    models: ["autore/modelo-prueba:free"],
    platformDailyRequests: 900,
    workspaceDailyLimit: 10,
  })),
}));
vi.mock("@/lib/ai/catalog", () => ({ readModelCatalog: vi.fn(async () => null) }));
vi.mock("@/lib/ai/requests", () => ({ recordAiRequest: vi.fn(async () => {}), enforcePlatformRequestCap: vi.fn(async () => {}) }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimits: vi.fn(async () => {}) }));

const fetchMock = vi.fn<typeof fetch>();

function keyword(text: string, isQuestion = false): TitleKeyword {
  return { keyword: text, canonical: canonicalizeKeyword(text, "es"), isQuestion };
}

const spoke: TitlePage = {
  kind: "SPOKE",
  contentType: "product_category",
  main: keyword("cama de hospital precio"),
  secondary: [keyword("cama de hospital barata"), keyword("cuánto cuesta una cama de hospital", true)],
};

const completion = () =>
  Response.json({
    model: "autore/modelo-prueba:free",
    choices: [
      {
        message: {
          content: JSON.stringify({
            h1: "Precio de una cama de hospital: modelos y ofertas",
            h2: ["Camas de hospital baratas", "¿Cuánto cuesta una cama de hospital?"],
          }),
        },
      },
    ],
  });

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", randomUUID());
  vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.test/api/v1");
  vi.stubEnv("LOG_LEVEL", "error");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Messaggio di sistema inviato a OpenRouter quando un MEMBER chiede la proposta per lo spoke di un piano in spagnolo. */
async function systemMessageFor(country: string): Promise<string> {
  vi.mocked(readPlanTitlePage).mockResolvedValueOnce({ language: "es", country, page: spoke });
  fetchMock.mockResolvedValueOnce(completion());

  const proposal = await suggestPageTitles({ id: randomUUID(), isRootAdmin: false }, "proyecto", "estrategia", "pagina");

  expect(proposal.h1).toBe("Precio de una cama de hospital: modelos y ofertas");
  const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as { messages: { role: string; content: string }[] };
  expect(body.messages[0].role).toBe("system");
  return body.messages[0].content;
}

describe("titoli con l'AI in spagnolo", () => {
  // covers: AC-5102-1
  it("le istruzioni sono in spagnolo e chiedono lo spagnolo di México con MX e di España con ES", async () => {
    const mexico = await systemMessageFor("MX");
    const spain = await systemMessageFor("ES");
    const neutral = await systemMessageFor("US");

    expect(mexico).toContain("español de México");
    expect(spain).toContain("español de España");
    expect(neutral).toContain("español neutro");
    for (const message of [mexico, spain, neutral]) {
      expect(message).toContain("Eres un experto en SEO");
      expect(message).toContain("«¿»");
      expect(message).not.toMatch(/You are an SEO expert|Sei un esperto di SEO/);
    }
    expect(spain).not.toContain("México");
  });

  // covers: AC-5102-2
  it("accetta l'H1 con «¿», accenti e parole vuote per la keyword principale senza", () => {
    const page: TitlePage = { kind: "SPOKE", contentType: "faq", main: keyword("cuanto cuesta alquilar cama hospital", true), secondary: [] };
    const content = JSON.stringify({ h1: "¿Cuánto cuesta alquilar una cama de hospital?", h2: ["Precios del alquiler por mes"] });

    expect(parseTitlesResponse(content, page, "es")).toEqual({
      h1: "¿Cuánto cuesta alquilar una cama de hospital?",
      h2: ["Precios del alquiler por mes"],
      droppedH2: 0,
    });
  });
});
