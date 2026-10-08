import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { APP_TIME_ZONE, type AppLocale, isSupportedLocale, LOCALE_COOKIE, PAGE_LOCALE_HEADER, resolveLocale } from "@/lib/i18n/locale";
import en from "@/messages/en.json";
import it from "@/messages/it.json";

// Cataloghi da una mappa statica indicizzata dalla lingua già validata, mai da un percorso composto con l'input (CWE-22).
const MESSAGES: Record<AppLocale, typeof it> = { it, en };

/**
 * Lingua della richiesta (T-1301): sulle pagine pubbliche quella del percorso (/it, /en, T-1801), passata dal proxy;
 * altrimenti preferenza dell'utente della sessione, poi cookie kwb_locale, poi Accept-Language, poi it. L'utente è
 * quello risolto una volta per richiesta e condiviso con il layout.
 */
export default getRequestConfig(async () => {
  const headerStore = await headers();
  const pageLocale = headerStore.get(PAGE_LOCALE_HEADER);
  if (isSupportedLocale(pageLocale)) {
    return { locale: pageLocale, messages: MESSAGES[pageLocale], timeZone: APP_TIME_ZONE };
  }

  const [user, cookieStore] = await Promise.all([getOptionalAuthenticatedUserFromCookies(), cookies()]);

  const locale = resolveLocale({
    userLocale: user?.uiLocale ?? null,
    cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return { locale, messages: MESSAGES[locale], timeZone: APP_TIME_ZONE };
});
