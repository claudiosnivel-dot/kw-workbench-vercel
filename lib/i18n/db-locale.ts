import type { UiLocale } from "@/lib/generated/prisma/enums";
import { type AppLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";

// users.ui_locale (T-1301, T-4701): Prisma espone i nomi dell'enum (es_ES), il database e l'app i tag (es-ES, @map).
const APP_LOCALE_BY_UI_LOCALE: Record<UiLocale, AppLocale> = { it: "it", en: "en", es_ES: "es-ES", es_419: "es-419" };
const UI_LOCALE_BY_APP_LOCALE: Record<AppLocale, UiLocale> = { it: "it", en: "en", "es-ES": "es_ES", "es-419": "es_419" };

/** Lingua dell'app di users.ui_locale (es_ES → es-ES), null se l'utente non l'ha scelta. */
export function appLocaleOf(value: UiLocale | null): AppLocale | null {
  return value === null ? null : APP_LOCALE_BY_UI_LOCALE[value];
}

/** Lingua delle email di un utente (T-1402): quella che ha scelto, altrimenti it. */
export function emailLocaleOf(value: UiLocale | null): AppLocale {
  return appLocaleOf(value) ?? DEFAULT_LOCALE;
}

/** Valore di users.ui_locale per una lingua dell'app (es-419 → es_419). */
export function uiLocaleOf(locale: AppLocale): UiLocale {
  return UI_LOCALE_BY_APP_LOCALE[locale];
}
