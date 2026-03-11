export type ApiErrorPayload = {
  error?: string;
  message?: string;
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
  const payloadError = payload?.error?.trim() || payload?.message?.trim();
  if (payloadError) {
    return payloadError;
  }

  if (response.status === 401) {
    return "Sessione non valida o scaduta. Effettua di nuovo il login.";
  }

  if (response.status === 403) {
    return "Operazione non autorizzata.";
  }

  return `${fallback} (HTTP ${response.status})`;
}