/**
 * Lingua dell'interfaccia (T-1301, D-07; T-4701, D-47): italiano, inglese e le due varianti dello spagnolo, default
 * italiano, nessun prefisso negli URL dell'app (le pagine pubbliche di T-1801 hanno /it ed /en, D-28 emendata, e da
 * T-4902 /es ed /es-419). Modulo puro, senza import: lo usano i18n/request.ts, la rotta /api/locale e il selettore.
 */

export const SUPPORTED_LOCALES = ["it", "en", "es-ES", "es-419"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Lingue offerte (T-4701): selettori, preferenze salvabili (PATCH e POST /api/locale), riconoscimento dal browser e sito
 * pubblico. Lo spagnolo è offerto da T-4902, a cataloghi completi; una lingua nuova entra qui solo quando è pronta.
 */
export const OFFERED_LOCALES = ["it", "en", "es-ES", "es-419"] as const satisfies readonly AppLocale[];
export type OfferedLocale = (typeof OFFERED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "it";
export const LOCALE_COOKIE = "kwb_locale";

/**
 * Lingua del percorso di una pagina pubblica (/it, /en/pricing..., T-1801, D-28 emendata): la scrive il proxy sulla
 * richiesta inoltrata, sempre sovrascritta o rimossa, mai il valore del client; i18n/request.ts la legge per prima.
 */
export const PAGE_LOCALE_HEADER = "x-kwb-page-locale";

/** Fuso orario unico di date e ore formattate (server e client devono coincidere): quello del mercato di default. */
export const APP_TIME_ZONE = "Europe/Rome";

/**
 * Paesi ispanofoni d'America Latina (T-4701): un browser es-<paese> di questo elenco vale es-419 e il paese diventa
 * quello predefinito delle ricerche; con es-419 senza un paese dell'elenco il paese delle ricerche è MX.
 */
export const LATIN_AMERICA_COUNTRIES: readonly string[] = [
  "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE",
];

/** Solo i letterali ammessi superano il controllo (CWE-22, CWE-79): ogni altro valore è scartato. */
export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Lingua offerta nei selettori e salvabile (T-4701, T-4902). */
export function isOfferedLocale(value: unknown): value is OfferedLocale {
  return typeof value === "string" && (OFFERED_LOCALES as readonly string[]).includes(value);
}

// Un elemento di Accept-Language: tag di lingua (con eventuali sottotag) e peso q facoltativo tra 0 e 1.
const LANGUAGE_RANGE = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;
const QUALITY = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i;
// Sottotag di regione di un tag BCP 47: due lettere (MX) o tre cifre (419), dopo l'eventuale scrittura (Latn).
const REGION_SUBTAG = /^(?:[a-z]{2}|\d{3})$/;

/** Tag di Accept-Language minuscoli ordinati per peso decrescente (a parità, nell'ordine dell'header); malformati scartati. */
function parseAcceptLanguage(header: string): string[] {
  const entries: { tag: string; quality: number; index: number }[] = [];

  header.split(",").forEach((part, index) => {
    const [range, ...params] = part.trim().split(";").map((piece) => piece.trim());
    if (!range || !LANGUAGE_RANGE.test(range)) return;

    let quality = 1;
    for (const param of params) {
      const weight = QUALITY.exec(param);
      if (!weight) return;
      quality = Number(weight[1]);
    }

    if (quality > 0) {
      entries.push({ tag: range.toLowerCase(), quality, index });
    }
  });

  return entries.sort((a, b) => b.quality - a.quality || a.index - b.index).map((entry) => entry.tag);
}

/** Regione maiuscola di un tag (es-mx → MX, es-419 → 419), null senza regione. */
function regionOf(tag: string): string | null {
  const region = tag.split("-").slice(1).find((subtag) => REGION_SUBTAG.test(subtag));
  return region ? region.toUpperCase() : null;
}

/**
 * Lingua dell'app di un tag (T-1301, T-4701): it-IT → it, en-US → en; es ed es-ES → es-ES; es-419, es-US ed es con un
 * paese d'America Latina → es-419; gli altri es-XX → es-ES; ogni altra lingua null.
 */
function localeOfTag(tag: string): AppLocale | null {
  const language = tag.split("-")[0];
  if (language === "it" || language === "en") return language;
  if (language !== "es") return null;

  const region = regionOf(tag);
  return region === "419" || region === "US" || (region !== null && LATIN_AMERICA_COUNTRIES.includes(region)) ? "es-419" : "es-ES";
}

/** Paese d'America Latina della prima lingua spagnola di Accept-Language (es-CO → CO), null senza (T-4701). */
export function latinAmericaCountryOf(acceptLanguage: string | null | undefined): string | null {
  const spanish = parseAcceptLanguage(acceptLanguage ?? "").find((tag) => tag.split("-")[0] === "es");
  const region = spanish ? regionOf(spanish) : null;
  return region !== null && LATIN_AMERICA_COUNTRIES.includes(region) ? region : null;
}

export type LocaleSources = {
  userLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
};

/**
 * Priorità: preferenza dell'utente (qualunque lingua supportata, salvata solo dalle rotte che accettano le offerte), poi
 * cookie, poi Accept-Language per peso (en-US → en, es-AR → es-419), poi it. Cookie e browser valgono solo per le lingue
 * di offered: OFFERED_LOCALES di default.
 */
export function resolveLocale(
  { userLocale, cookieLocale, acceptLanguage }: LocaleSources,
  offered: readonly AppLocale[] = OFFERED_LOCALES
): AppLocale {
  const isOffered = (value: unknown): value is AppLocale => isSupportedLocale(value) && offered.includes(value);
  if (isSupportedLocale(userLocale)) return userLocale;
  if (isOffered(cookieLocale)) return cookieLocale;

  const fromHeader = parseAcceptLanguage(acceptLanguage ?? "").map(localeOfTag).find(isOffered);
  return fromHeader ?? DEFAULT_LOCALE;
}
