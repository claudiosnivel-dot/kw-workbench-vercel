/**
 * Versione corrente di termini di servizio e informativa sulla privacy (T-1405), da importare anche nelle pagine
 * legali di T-1803. Valore segnaposto finché i testi di D-15 non sono forniti: cambiarla chiede a ogni utente di
 * riaccettare al primo accesso successivo.
 */
export const LEGAL_TERMS_VERSION = "segnaposto-2026-10-07";

/**
 * Voce legal della checklist del lancio commerciale (T-1606, D-32): testi legali di T-1803 presenti, con status diverso
 * da placeholder e version dei termini uguale a LEGAL_TERMS_VERSION. T-1803 non è ancora costruito, quindi i testi
 * mancano e la voce resta mancante (mai verde): T-1803 sostituisce questo controllo con quello dei suoi file.
 */
export function areLegalTextsPublished(): boolean {
  return false;
}
