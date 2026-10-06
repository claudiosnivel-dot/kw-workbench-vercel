import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

const PAUSE_FAILED_MESSAGE = "Impossibile mettere in pausa il percorso guidato.";

type CreationResponse = ApiErrorPayload & { data?: { nextPath?: string } };

// Chiavi del passo quando sessionStorage manca o lancia (navigazione privata, storage bloccato): valgono per la
// pagina corrente.
const memoryKeys = new Map<string, string>();

/** Chiave di idempotenza del passo (T-1001): la stessa dopo un reload o il back del browser. */
function readIdempotencyKey(storageKey: string): string {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
  } catch {
    // storage non disponibile
  }

  const key = memoryKeys.get(storageKey) ?? crypto.randomUUID();
  memoryKeys.set(storageKey, key);
  try {
    window.sessionStorage.setItem(storageKey, key);
  } catch {
    // storage non disponibile
  }
  return key;
}

function clearIdempotencyKey(storageKey: string): void {
  memoryKeys.delete(storageKey);
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // storage non disponibile
  }
}

/**
 * Creazione di un passo dell'onboarding (T-1001): POST con la chiave di idempotenza del passo, così un retry, un
 * doppio clic o un reload non creano duplicati; dopo una risposta riuscita la chiave si scarta. Restituisce il
 * nextPath indicato dal server.
 */
export async function submitOnboardingCreation(
  url: string,
  storageKey: string,
  body: Record<string, string>,
  failureMessage: string
): Promise<string | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idempotencyKey: readIdempotencyKey(storageKey) }),
  });

  const payload = await readJsonSafe<CreationResponse>(response);
  if (!response.ok) {
    throw new Error(buildApiErrorMessage(response, payload, failureMessage));
  }

  clearIdempotencyKey(storageKey);
  return payload?.data?.nextPath ?? null;
}

/** Mette in pausa l'onboarding (POST /api/onboarding/skip) e apre la dashboard, che mostra il banner di ripresa. */
export async function pauseOnboardingAndOpenDashboard(): Promise<void> {
  const response = await fetch("/api/onboarding/skip", { method: "POST" });
  if (!response.ok) {
    throw new Error(PAUSE_FAILED_MESSAGE);
  }

  window.location.assign("/");
}
