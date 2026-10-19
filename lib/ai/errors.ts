import { AppError } from "@/lib/http/errors";

/**
 * Esiti non riusciti di una proposta dei titoli con l'AI (T-3502, D-42), con lo status della rotta (T-3601); con i
 * modelli di riserva (T-3802) anche i modelli tutti occupati e le richieste gratuite del giorno finite.
 */
export type AiTitlesErrorCode = "AI_NOT_CONFIGURED" | "AI_TIMEOUT" | "AI_UNAVAILABLE" | "AI_INVALID_RESPONSE" | "AI_BUSY" | "AI_DAILY_LIMIT";

const STATUS: Record<AiTitlesErrorCode, number> = {
  AI_NOT_CONFIGURED: 503,
  AI_TIMEOUT: 504,
  AI_UNAVAILABLE: 502,
  AI_INVALID_RESPONSE: 502,
  AI_BUSY: 503,
  AI_DAILY_LIMIT: 429,
};

/** Errore dei titoli con l'AI: il messaggio non contiene mai la chiave né il testo del modello (CWE-532). */
export class AiTitlesError extends AppError {
  constructor(code: AiTitlesErrorCode, message: string) {
    super(STATUS[code], code, message);
    this.name = "AiTitlesError";
  }
}
