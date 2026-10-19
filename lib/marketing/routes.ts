import { type AppLocale, isOfferedLocale, OFFERED_LOCALES, type OfferedLocale } from "@/lib/i18n/locale";

/**
 * Pagine pubbliche del sito (T-1801…T-1805): l'unico elenco letto dal proxy (percorsi ammessi senza sessione, a match
 * esatto) e dalla sitemap. URL con prefisso per le lingue offerte (D-28 emendata): /it e /en, poi la pagina; lo
 * spagnolo ha le sue pagine da T-4902 (T-4701).
 * Modulo puro, senza accessi al server: lo usano anche la barra di navigazione e il footer lato client.
 */
export const MARKETING_PAGES = ["home", "pricing", "privacy", "terms", "cookies", "contact"] as const;
export type MarketingPage = (typeof MARKETING_PAGES)[number];

export type MarketingRoute = {
  path: string;
  locale: OfferedLocale;
  page: MarketingPage;
  /** Stessa pagina nell'altra lingua (hreflang e selettore della lingua). */
  alternate: string;
  inSitemap: boolean;
};

// Il modulo contatti non va in sitemap: è una pagina di servizio, non un contenuto da indicizzare.
const SITEMAP_PAGES: ReadonlySet<MarketingPage> = new Set(["home", "pricing", "privacy", "terms", "cookies"]);

/** Lingua del sito pubblico per la lingua dell'app (T-4701): fino alle pagine spagnole di T-4902 lo spagnolo va all'inglese. */
export function siteLocale(locale: AppLocale): OfferedLocale {
  return isOfferedLocale(locale) ? locale : "en";
}

/** Percorso di una pagina pubblica in una lingua: /it, /en/pricing, /it/terms... */
export function marketingPath(page: MarketingPage, locale: AppLocale): string {
  const site = siteLocale(locale);
  return page === "home" ? `/${site}` : `/${site}/${page}`;
}

function otherLocale(locale: OfferedLocale): OfferedLocale {
  return locale === "it" ? "en" : "it";
}

export const MARKETING_ROUTES: readonly MarketingRoute[] = MARKETING_PAGES.flatMap((page) =>
  OFFERED_LOCALES.map((locale) => ({
    path: marketingPath(page, locale),
    locale,
    page,
    alternate: marketingPath(page, otherLocale(locale)),
    inSitemap: SITEMAP_PAGES.has(page),
  }))
);

const ROUTES_BY_PATH = new Map(MARKETING_ROUTES.map((route) => [route.path, route]));

/** Voce dell'elenco per il percorso esatto (nessun prefisso, CWE-863), null per ogni altro percorso. */
export function findMarketingRoute(pathname: string): MarketingRoute | null {
  return ROUTES_BY_PATH.get(pathname) ?? null;
}
