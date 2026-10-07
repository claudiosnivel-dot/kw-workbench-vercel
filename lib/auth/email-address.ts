// Nessun import: il modulo serve anche alla validazione dell'ambiente (lib/env.ts), letta dal proxy in runtime edge.

const MAX_EMAIL_LENGTH = 254;
// local@dominio con almeno un punto nel dominio; niente spazi, quindi niente CR e LF (CWE-93).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Indirizzo email normalizzato (T-1401): senza spazi ai bordi e minuscolo; null se supera 254 caratteri, contiene
 * spazi o ritorni a capo o non ha la forma local@dominio con almeno un punto nel dominio.
 */
export function normalizeEmail(input: unknown): string | null {
  const email = String(input ?? "").trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) ? email : null;
}

/** Dominio di un indirizzo già normalizzato: l'unica parte dell'indirizzo che può finire nei log (T-1402). */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}
