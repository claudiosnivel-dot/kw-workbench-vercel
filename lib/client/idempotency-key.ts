/**
 * Chiave di idempotenza di un passo dell'onboarding (T-1001), conservata in sessionStorage: la stessa dopo un
 * reload o il back del browser, nuova dopo una creazione riuscita. Lo storage può mancare o lanciare
 * (navigazione privata, storage bloccato): in quel caso la chiave vale solo per la pagina corrente.
 */
export function readIdempotencyKey(storageKey: string): string {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
  } catch {
    // storage non disponibile
  }

  const created = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(storageKey, created);
  } catch {
    // storage non disponibile
  }
  return created;
}

export function clearIdempotencyKey(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // storage non disponibile
  }
}
