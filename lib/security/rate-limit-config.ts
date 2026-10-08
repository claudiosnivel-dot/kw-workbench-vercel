import { getIntEnv } from "@/lib/env";

/** Regola di rate limit (T-1701): al massimo max tentativi ammessi in una finestra scorrevole di windowSeconds. */
export type RateLimitRule = { max: number; windowSeconds: number };

/**
 * Regole del rate limiter (T-1701, D-12) con i valori iniziali PROPOSTI di INT_ENV, sovrascrivibili dall'ambiente
 * validato: login per IP+email e per IP, registrazione per IP, richiesta di reset per email e per IP, avvii di
 * estrazione per workspace con il lancio attivo (D-27 emendata). Lette a ogni uso, così i test iniettano soglie basse.
 */
export function rateLimitRules() {
  const loginWindow = getIntEnv("RATE_LIMIT_LOGIN_WINDOW_SECONDS");
  const resetWindow = getIntEnv("RATE_LIMIT_RESET_WINDOW_SECONDS");
  return {
    loginIpEmail: { max: getIntEnv("RATE_LIMIT_LOGIN_IP_EMAIL_MAX"), windowSeconds: loginWindow },
    loginIp: { max: getIntEnv("RATE_LIMIT_LOGIN_IP_MAX"), windowSeconds: loginWindow },
    registerIp: { max: getIntEnv("RATE_LIMIT_REGISTER_IP_MAX"), windowSeconds: getIntEnv("RATE_LIMIT_REGISTER_WINDOW_SECONDS") },
    resetEmail: { max: getIntEnv("RATE_LIMIT_RESET_EMAIL_MAX"), windowSeconds: resetWindow },
    resetIp: { max: getIntEnv("RATE_LIMIT_RESET_IP_MAX"), windowSeconds: resetWindow },
    runStart: { max: getIntEnv("RATE_LIMIT_RUN_START_MAX"), windowSeconds: getIntEnv("RATE_LIMIT_RUN_START_WINDOW_SECONDS") },
  } satisfies Record<string, RateLimitRule>;
}

/** Finestra più lunga tra le regole: le righe più vecchie non servono più a nessuna regola (pruneRateLimitHits). */
export function maxRateLimitWindowSeconds(): number {
  return Math.max(...Object.values(rateLimitRules()).map((rule) => rule.windowSeconds));
}
