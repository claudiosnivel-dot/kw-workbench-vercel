/**
 * Lingua dell'interfaccia (T-1301, D-07): italiano e inglese, default italiano, nessun prefisso negli URL dell'app (le
 * pagine pubbliche di T-1801 hanno /it e /en, D-28 emendata).
 * Modulo puro, senza import: lo usano i18n/request.ts, la rotta /api/locale e il selettore lato client.
 */

export const SUPPORTED_LOCALES = ["it", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "it";
export const LOCALE_COOKIE = "kwb_locale";

/**
 * Lingua del percorso di una pagina pubblica (/it, /en/pricing..., T-1801, D-28 emendata): la scrive il proxy sulla
 * richiesta inoltrata, sempre sovrascritta o rimossa, mai il valore del client; i18n/request.ts la legge per prima.
 */
export const PAGE_LOCALE_HEADER = "x-kwb-page-locale";

/** Fuso orario unico di date e ore formattate (server e client devono coincidere): quello del mercato di default. */
export const APP_TIME_ZONE = "Europe/Rome";

/** Solo i due letterali ammessi superano il controllo (CWE-22, CWE-79): ogni altro valore è scartato. */
export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Un elemento di Accept-Language: tag di lingua (con eventuali sottotag) e peso q facoltativo tra 0 e 1.
const LANGUAGE_RANGE = /^([A-Za-z]{1,8})(?:-[A-Za-z0-9]{1,8})*$/;
const QUALITY = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i;

/** Lingue di Accept-Language ordinate per peso decrescente (a parità, nell'ordine dell'header); malformate scartate. */
function parseAcceptLanguage(header: string): string[] {
  const entries: { language: string; quality: number; index: number }[] = [];

  header.split(",").forEach((part, index) => {
    const [range, ...params] = part.trim().split(";").map((piece) => piece.trim());
    const match = range ? LANGUAGE_RANGE.exec(range) : null;
    if (!match) return;

    let quality = 1;
    for (const param of params) {
      const weight = QUALITY.exec(param);
      if (!weight) return;
      quality = Number(weight[1]);
    }

    if (quality > 0) {
      entries.push({ language: match[1].toLowerCase(), quality, index });
    }
  });

  return entries.sort((a, b) => b.quality - a.quality || a.index - b.index).map((entry) => entry.language);
}

export type LocaleSources = {
  userLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
};

/** Priorità: preferenza dell'utente, poi cookie, poi Accept-Language (regione ridotta: en-US → en), poi it. */
export function resolveLocale({ userLocale, cookieLocale, acceptLanguage }: LocaleSources): AppLocale {
  if (isSupportedLocale(userLocale)) return userLocale;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;

  const fromHeader = parseAcceptLanguage(acceptLanguage ?? "").find(isSupportedLocale);
  return fromHeader ?? DEFAULT_LOCALE;
}
