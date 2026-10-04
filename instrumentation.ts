import { getEnv } from "@/lib/env";

// Validazione della configurazione all'avvio (T-201): con variabili errate il server non parte
// e l'errore elenca le variabili da correggere.
export function register(): void {
  getEnv();
}
