import { AUTH_REQUIRED_CODE, AUTH_REQUIRED_MESSAGE } from "@/lib/http/auth-required";

export type ApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
};

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

export function buildApiErrorMessage(
  response: Response,
  payload: ApiErrorPayload | null,
  fallback: string
): string {
  // Sessione assente o scaduta: il messaggio italiano vince anche su un body "Unauthorized" (T-502).
  // Restano i 401 con un messaggio proprio (credenziali errate al login, password attuale errata).
  const payloadError = payload?.error?.trim() || payload?.message?.trim();
  const genericUnauthorized = response.status === 401 && (!payloadError || payloadError === "Unauthorized");
  if (payload?.code === AUTH_REQUIRED_CODE || genericUnauthorized) {
    return AUTH_REQUIRED_MESSAGE;
  }

  if (payloadError) {
    return payloadError;
  }

  if (response.status === 403) {
    return "Operazione non autorizzata.";
  }

  return `${fallback} (HTTP ${response.status})`;
}