import type { createTranslator, Messages } from "next-intl";
import { AUTH_REQUIRED_CODE } from "@/lib/http/auth-required";
import { isApiErrorCode } from "@/lib/http/error-codes";

export type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
};

/** Traduzioni del namespace errors: useTranslations("errors") nei componenti (T-1303). */
export type ErrorTranslator = ReturnType<typeof createTranslator<Messages, "errors">>;

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Richiesta con body JSON verso un'API dell'app. */
export function sendJson(method: "POST" | "PATCH", url: string, body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Messaggio di un errore catturato: quello dell'Error (già tradotto per le risposte API), altrimenti fallback. */
export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Body letto di una risposta riuscita; se la risposta non è ok lancia un Error con il testo del catalogo (T-1303). */
export async function readApiResponse<T>(response: Response, t: ErrorTranslator): Promise<T | null> {
  const payload = await readJsonSafe<T & ApiErrorPayload>(response);
  if (!response.ok) {
    throw new Error(buildApiErrorMessage(response, payload, t));
  }
  return payload;
}

/** Dati di una risposta { data } oppure il messaggio d'errore del catalogo per la risposta (T-1303). */
export async function readApiData<T>(response: Response, t: ErrorTranslator): Promise<{ data: T } | { error: string }> {
  const payload = await readJsonSafe<ApiErrorPayload & { data?: T }>(response);
  if (!response.ok || !payload?.data) {
    return { error: buildApiErrorMessage(response, payload, t) };
  }
  return { data: payload.data };
}

/**
 * Messaggio d'errore di una risposta API nella lingua corrente (T-1303): per un code di API_ERROR_CODES il testo
 * del catalogo, mai il campo error del server (CWE-209); senza code noto errors.UNKNOWN con lo status HTTP. Un 401
 * senza code noto (per esempio un body "Unauthorized" che non arriva dall'app) resta la sessione scaduta (T-502).
 */
export function buildApiErrorMessage(response: Response, payload: ApiErrorPayload | null, t: ErrorTranslator): string {
  if (isApiErrorCode(payload?.code)) {
    return t(payload.code);
  }

  if (response.status === 401) {
    return t(AUTH_REQUIRED_CODE);
  }

  return t("UNKNOWN", { status: response.status });
}
