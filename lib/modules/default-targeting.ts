import { type AppLocale, isSupportedLocale, latinAmericaCountryOf } from "@/lib/i18n/locale";

export type Targeting = { languageCode: string; countryCode: string };

// Lingua e paese delle ricerche per lingua dell'interfaccia (T-2301, T-4701); es-419 prende il paese dal browser.
const TARGETING_BY_UI_LOCALE: Record<AppLocale, Targeting> = {
  it: { languageCode: "it", countryCode: "IT" },
  en: { languageCode: "en", countryCode: "US" },
  "es-ES": { languageCode: "es", countryCode: "ES" },
  "es-419": { languageCode: "es", countryCode: "MX" },
};

/**
 * Lingua e paese predefiniti di un workspace senza progetti (T-2301, T-4701): it/IT con l'interfaccia in italiano o
 * senza lingua riconosciuta, en/US in inglese, es/ES in es-ES; in es-419 es e il paese d'America Latina di
 * Accept-Language (es-CO → CO), altrimenti MX. Modulo puro: lo usano targeting.ts e i test.
 */
export function defaultTargeting(uiLocale: string | null, acceptLanguage: string | null): Targeting {
  if (!isSupportedLocale(uiLocale)) {
    return TARGETING_BY_UI_LOCALE.it;
  }
  if (uiLocale === "es-419") {
    return { languageCode: "es", countryCode: latinAmericaCountryOf(acceptLanguage) ?? TARGETING_BY_UI_LOCALE["es-419"].countryCode };
  }
  return TARGETING_BY_UI_LOCALE[uiLocale];
}
