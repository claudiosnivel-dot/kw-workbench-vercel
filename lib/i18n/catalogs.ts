import type { AppLocale } from "@/lib/i18n/locale";
import en from "@/messages/en.json";
import it from "@/messages/it.json";

/**
 * Cataloghi da una mappa statica indicizzata dalla lingua già validata, mai da un percorso composto con l'input
 * (CWE-22): li usano i traduttori fuori dalla richiesta (email, T-1402; strategie, T-1902 e T-1907).
 */
export const MESSAGES: Record<AppLocale, typeof it> = { it, en };
