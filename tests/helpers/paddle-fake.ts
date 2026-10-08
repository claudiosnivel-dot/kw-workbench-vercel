import { vi } from "vitest";

export type RecordedPaddleRequest = { method: string; url: string; authorization: string | null; body: Record<string, unknown> };

/**
 * Fake HTTP dell'API di Paddle (T-1602, T-1604) al posto di fetch: registra metodo, URL, Authorization e body di ogni
 * richiesta e risponde con l'envelope { data, meta } di Paddle. responses associa "METODO percorso" al data restituito;
 * una richiesta senza risposta configurata riceve 500.
 */
export function fakePaddleApi(responses: Record<string, unknown> = {}) {
  const requests: RecordedPaddleRequest[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    requests.push({
      method,
      url: url.href,
      authorization: headers.get("authorization"),
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const data = responses[`${method} ${url.pathname}`];
    return data === undefined
      ? Response.json({ error: { code: "internal_error" } }, { status: 500 })
      : Response.json({ data, meta: { request_id: "req_fake" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests };
}
