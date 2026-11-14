/*
 * Prova dei modelli gratuiti di OpenRouter con la richiesta della scaletta di un articolo (T-6401, T-6403): per ogni
 * modello ':free' a prezzo 0 del catalogo pubblico, una richiesta come quella del motore degli articoli (max_tokens con
 * REASONING_TOKEN_ALLOWANCE in più per i modelli che ragionano, 90 s), poi il controllo della scaletta. Serve a scegliere
 * DEFAULT_AI_MODELS e i modelli della card. Stampa solo modello, secondi ed esito: mai la chiave né il testo del
 * modello (CWE-532). Nessuna scrittura nel database.
 *
 * Uso: OPENROUTER_API_KEY in .env (la variabile di Vercel è cifrata e non si scarica), poi `npm run ai:probe`; con
 * degli ID dopo `--` prova solo quelli.
 */
import { REASONING_TOKEN_ALLOWANCE } from "@/lib/ai/models";
import { requestCompletion } from "@/lib/ai/openrouter";
import { buildOutlineRequest, type OutlineInput } from "@/lib/articles/outline-prompt";
import { parseOutlineResponse } from "@/lib/articles/outline-response";
import { getOpenRouterBaseUrl, getOpenRouterSettings } from "@/lib/env";
import { canonicalizeKeyword } from "@/lib/modules/normalization";

const ATTEMPT_TIMEOUT_MS = 90_000;

const term = (text: string, isQuestion = false) => ({ keyword: text, canonical: canonicalizeKeyword(text, "it"), isQuestion });

/** Pagina di prova: uno spoke con tre H2, la sua pilastro e un altro spoke, articolo MEDIUM. */
const PROBE_INPUT: OutlineInput = {
  plan: {
    language: "it",
    country: "IT",
    page: {
      kind: "SPOKE",
      contentType: "guide",
      main: term("scarpe da trail running"),
      secondary: [term("scarpe trail running prezzi"), term("come scegliere le scarpe da trail", true)],
    },
    h1: "Scarpe da trail running: come sceglierle",
    h2: ["Suola e grip", "Ammortizzazione", "Taglia e calzata"],
    linkable: [
      { pageId: "pilastro", role: "pillar", h1: "Scarpe da corsa: la guida" },
      { pageId: "spoke", role: "spoke", h1: "Scarpe running donna" },
    ],
  },
  brief: { about: "Negozio di articoli per la corsa", audience: "Chi inizia a correre in montagna", tone: "friendly" },
  notes: null,
  length: "MEDIUM",
};

type PublicModel = { id?: unknown; pricing?: unknown; supported_parameters?: unknown };

/** Modelli ':free' a prezzo 0 del catalogo pubblico, con reasoning se lo supportano. */
async function freeModels(): Promise<{ id: string; reasoning: boolean }[]> {
  const response = await fetch(`${getOpenRouterBaseUrl()}/models`, { signal: AbortSignal.timeout(10_000) });
  const { data } = (await response.json()) as { data: PublicModel[] };
  return data
    .filter((model): model is PublicModel & { id: string } => typeof model.id === "string" && model.id.endsWith(":free"))
    .filter((model) => Object.values((model.pricing ?? {}) as Record<string, unknown>).every((price) => Number(price) === 0))
    .map((model) => ({ id: model.id, reasoning: Array.isArray(model.supported_parameters) && model.supported_parameters.includes("reasoning") }));
}

async function probe(settings: { apiKey: string; baseUrl: string }, model: { id: string; reasoning: boolean }): Promise<string> {
  const request = buildOutlineRequest(PROBE_INPUT);
  const maxTokens = request.max_tokens + (model.reasoning ? REASONING_TOKEN_ALLOWANCE : 0);
  const startedAt = Date.now();
  let outcome = "valida";
  try {
    const { content } = await requestCompletion({ ...request, model: model.id, max_tokens: maxTokens }, { ...settings, timeoutMs: ATTEMPT_TIMEOUT_MS });
    parseOutlineResponse(content, PROBE_INPUT);
  } catch (error) {
    outcome = error instanceof Error && "code" in error ? `${String(error.code)}: ${error.message.slice(0, 80)}` : "errore";
  }
  return `${model.id}\tmax_tokens ${maxTokens}\t${((Date.now() - startedAt) / 1000).toFixed(1)} s\t${outcome}`;
}

async function main(): Promise<void> {
  const settings = getOpenRouterSettings();
  if (!settings) {
    console.error("OPENROUTER_API_KEY non è impostata: mettila in .env e riprova.");
    process.exitCode = 1;
    return;
  }
  const only = process.argv.slice(2);
  const models = (await freeModels()).filter((model) => only.length === 0 || only.includes(model.id));
  const lines = await Promise.all(models.map((model) => probe(settings, model)));
  console.log(lines.join("\n"));
}

void main();
