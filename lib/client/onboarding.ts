import { ApiErrorPayload, buildApiErrorMessage, type ErrorTranslator, readApiResponse, readJsonSafe } from "@/lib/client/http";
import { useLeavingAction } from "@/lib/client/use-leaving-action";

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
 * nextPath indicato dal server. Un errore porta il testo del catalogo per il code della risposta (T-1303).
 */
export async function submitOnboardingCreation(
  url: string,
  storageKey: string,
  body: Record<string, string>,
  tErrors: ErrorTranslator
): Promise<string | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idempotencyKey: readIdempotencyKey(storageKey) }),
  });

  const payload = await readApiResponse<CreationResponse>(response, tErrors);

  clearIdempotencyKey(storageKey);
  return payload?.data?.nextPath ?? null;
}

/**
 * Creazione di progetto o sezione nel percorso guidato (T-1001, T-1303): nome obbligatorio, POST idempotente e apertura
 * del passo successivo indicato dal server, altrimenti fallbackPath.
 */
export function useOnboardingCreation(options: { url: string; storageKey: string; fallbackPath: string; nameRequired: string }) {
  const { pending, error, setError, run } = useLeavingAction();

  const create = (name: string, body: Record<string, string> = {}) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(options.nameRequired);
      return;
    }

    void run(async (tErrors) => {
      const nextPath = await submitOnboardingCreation(options.url, options.storageKey, { ...body, name: trimmedName }, tErrors);
      window.location.assign(nextPath ?? options.fallbackPath);
    });
  };

  return { saving: pending !== null, error, create };
}

/**
 * Scelta o ripresa del percorso guidato (POST a url, con body JSON se presente): apre il nextPath indicato dal server
 * o fallbackPath; con una risposta non riuscita lancia l'errore del catalogo per il code (T-1303).
 */
export async function openOnboardingPath(
  url: string,
  body: Record<string, string> | null,
  fallbackPath: string,
  tErrors: ErrorTranslator
): Promise<void> {
  const response = await fetch(
    url,
    body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" }
  );
  const payload = await readApiResponse<ApiErrorPayload & { meta?: { nextPath?: string } }>(response, tErrors);

  window.location.assign(payload?.meta?.nextPath || fallbackPath);
}

/** Mette in pausa l'onboarding (POST /api/onboarding/skip) e apre la dashboard, che mostra il banner di ripresa. */
export async function pauseOnboardingAndOpenDashboard(tErrors: ErrorTranslator): Promise<void> {
  const response = await fetch("/api/onboarding/skip", { method: "POST" });
  if (!response.ok) {
    throw new Error(buildApiErrorMessage(response, await readJsonSafe<ApiErrorPayload>(response), tErrors));
  }

  window.location.assign("/");
}
