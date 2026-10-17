import { AiTitlesError } from "@/lib/ai/errors";
import type { TitlesRequest } from "@/lib/ai/titles-prompt";
import { getPublicAppUrl } from "@/lib/env";

type CompletionOptions = { apiKey: string; baseUrl: string; timeoutMs: number };
type CompletionPayload = { model?: unknown; choices?: { message?: { content?: unknown } }[] };

async function callOpenRouter(body: TitlesRequest, options: CompletionOptions, signal: AbortSignal) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "Titan SEO",
  };
  const referer = getPublicAppUrl();
  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch {
    throw new AiTitlesError("AI_UNAVAILABLE", "OpenRouter non è raggiungibile");
  }
  if (!response.ok) {
    throw new AiTitlesError("AI_UNAVAILABLE", `OpenRouter ha risposto ${response.status}`);
  }
  const payload = (await response.json().catch(() => null)) as CompletionPayload | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AiTitlesError("AI_UNAVAILABLE", "La risposta di OpenRouter non contiene il testo del modello");
  }
  return { content, model: typeof payload?.model === "string" ? payload.model : body.model };
}

/**
 * Una chiamata a OpenRouter (T-3502): POST {baseUrl}/chat/completions con la chiave come Bearer. Oltre timeoutMs la
 * richiesta si interrompe con AI_TIMEOUT, anche se il server non risponde all'abort; rete, status non 2xx o risposta
 * senza testo → AI_UNAVAILABLE. Nessun nuovo tentativo; né la chiave né il contenuto finiscono nei log (CWE-532).
 */
export async function requestCompletion(body: TitlesRequest, options: CompletionOptions): Promise<{ content: string; model: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiTitlesError("AI_TIMEOUT", `Il modello non ha risposto entro ${options.timeoutMs} ms`));
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([callOpenRouter(body, options, controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
