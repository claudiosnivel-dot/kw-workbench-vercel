import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getJobSigningSecret } from "@/lib/env";

// Firma delle chiamate interne che fanno avanzare un job (T-1203, CWE-345): HMAC-SHA256 con JOB_SIGNING_SECRET della
// stringa "<jobId>.<scadenza in ms epoch>", in base64url. Un replay entro la scadenza è innocuo: advanceJob lavora
// sotto lease ed è idempotente.

/** Validità di una firma. */
export const JOB_SIGNATURE_TTL_MS = 60_000;
// Tolleranza sugli orologi delle istanze: una scadenza oltre il TTL più questo margine non è stata emessa da qui.
const CLOCK_SKEW_MS = 5_000;

function hmac(secret: string, jobId: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`${jobId}.${expiresAt}`).digest("base64url");
}

/** Firma il passo del job con scadenza expiresAt (ms epoch); senza JOB_SIGNING_SECRET lancia un errore. */
export function signJobStep(jobId: string, expiresAt: number): string {
  const secret = getJobSigningSecret();
  if (!secret) {
    throw new Error("JOB_SIGNING_SECRET non configurata: impossibile firmare la continuazione del job");
  }
  return hmac(secret, jobId, expiresAt);
}

/** Confronto a tempo costante di due stringhe di lunghezza qualsiasi (digest SHA-256 di entrambe). */
export function safeEqualText(actual: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

/**
 * true solo se la firma è quella di jobId con la scadenza indicata e la scadenza non è passata. Firma o scadenza
 * assenti, scadenza non numerica o JOB_SIGNING_SECRET non configurata -> false (fail-closed).
 */
export function verifyJobStep(jobId: string, expires: string | null, signature: string | null, now = Date.now()): boolean {
  const secret = getJobSigningSecret();
  if (!secret || !expires || !signature || !/^\d{1,16}$/.test(expires)) {
    return false;
  }
  const expiresAt = Number(expires);
  if (expiresAt < now || expiresAt > now + JOB_SIGNATURE_TTL_MS + CLOCK_SKEW_MS) {
    return false;
  }
  return safeEqualText(signature, hmac(secret, jobId, expiresAt));
}
