import { AI_TITLES_CARD_HREF } from "@/lib/ai/models";
import { AppError, type ErrorFields } from "@/lib/http/errors";

/**
 * Esiti non riusciti di una proposta dei titoli con l'AI (T-3502, D-42), con lo status della rotta (T-3601); con i
 * modelli di riserva (T-3802) anche i modelli tutti occupati e le richieste gratuite del giorno finite; con T-6403
 * nessun modello gratuito utilizzabile, né dell'elenco né dei predefiniti.
 */
export type AiTitlesErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_INVALID_RESPONSE"
  | "AI_BUSY"
  | "AI_DAILY_LIMIT"
  | "AI_NO_MODELS";

const STATUS: Record<AiTitlesErrorCode, number> = {
  AI_NOT_CONFIGURED: 503,
  AI_TIMEOUT: 504,
  AI_UNAVAILABLE: 502,
  AI_INVALID_RESPONSE: 502,
  AI_BUSY: 503,
  AI_DAILY_LIMIT: 429,
  AI_NO_MODELS: 503,
};

/** Errore dei titoli con l'AI: il messaggio non contiene mai la chiave né il testo del modello (CWE-532). */
export class AiTitlesError extends AppError {
  constructor(code: AiTitlesErrorCode, message: string, fields?: ErrorFields) {
    super(STATUS[code], code, message, fields);
    this.name = "AiTitlesError";
  }
}

/**
 * 503 AI_NO_MODELS (T-6403): nessun modello dell'elenco né dei predefiniti è più gratuito. Per il root admin il body ha
 * anche cardHref, l'indirizzo della card dove si aggiorna l'elenco; per gli altri solo il codice.
 */
export function noModelsError(byRootAdmin: boolean): AiTitlesError {
  return new AiTitlesError(
    "AI_NO_MODELS",
    "Nessun modello AI gratuito disponibile: l'elenco dei modelli va aggiornato",
    byRootAdmin ? { cardHref: AI_TITLES_CARD_HREF } : undefined
  );
}
