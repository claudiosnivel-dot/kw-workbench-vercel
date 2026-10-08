import { isVercelRuntime } from "@/lib/env";

const UNKNOWN_IP = "unknown";
// IPv4 o IPv6 come li scrive Vercel: cifre esadecimali, punti e due punti, al massimo 45 caratteri.
const IP_PATTERN = /^[0-9a-fA-F.:]{2,45}$/;

/**
 * IP del client per le chiavi del rate limit (T-1701) e il remoteip del CAPTCHA (T-1702). Su Vercel x-forwarded-for è
 * sovrascritto dalla piattaforma con l'IP pubblico del client e se ne prende il primo valore; fuori da Vercel, o con
 * l'header assente o malformato, vale 'unknown': un header del client non è mai una fonte affidabile (CWE-348).
 */
export function getClientIp(request: Request): string {
  if (!isVercelRuntime()) {
    return UNKNOWN_IP;
  }
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return IP_PATTERN.test(first) ? first : UNKNOWN_IP;
}

/** true se l'IP è noto (non 'unknown'): solo allora va passato a siteverify come remoteip. */
export function isKnownClientIp(ip: string): boolean {
  return ip !== UNKNOWN_IP;
}
