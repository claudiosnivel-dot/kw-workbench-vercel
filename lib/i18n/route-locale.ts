import type { NextRequest } from "next/server";
import { type AppLocale, isSupportedLocale, LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/locale";

/**
 * Lingua di una rotta API (T-1301), con le priorità di i18n/request.ts: preferenza dell'utente della sessione, poi
 * cookie kwb_locale, poi Accept-Language, poi it. Una lingua chiesta esplicitamente (lang degli export della strategia,
 * T-1907 e T-2102) vale se è supportata.
 */
export function routeLocale(request: NextRequest, user: { uiLocale: string | null }, requested?: string | null): AppLocale {
  if (isSupportedLocale(requested)) {
    return requested;
  }
  return resolveLocale({
    userLocale: user.uiLocale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
}
