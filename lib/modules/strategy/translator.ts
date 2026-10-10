import { createTranslator } from "next-intl";
import { MESSAGES } from "@/lib/i18n/catalogs";
import { APP_TIME_ZONE, type AppLocale, DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locale";
import type { TitleTranslator } from "@/lib/modules/strategy/titles";

export type CatalogTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

/**
 * Traduttore dei cataloghi in una lingua data, indipendente dalla richiesta: titoli nella lingua del perimetro
 * (T-1902), spiegazioni del PDF nella lingua scelta (T-1907). Una lingua senza catalogo usa l'italiano. Con un
 * namespace le chiavi sono relative a quel namespace.
 */
export function catalogTranslator(language: string, namespace?: "strategy"): CatalogTranslator {
  const locale: AppLocale = isSupportedLocale(language) ? language : DEFAULT_LOCALE;
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace, timeZone: APP_TIME_ZONE });
  return (key, values) => t(key as never, values as never);
}

/** Traduttore del namespace strategy per i titoli suggeriti (T-1902). */
export function strategyTranslator(language: string): TitleTranslator {
  return catalogTranslator(language, "strategy");
}
