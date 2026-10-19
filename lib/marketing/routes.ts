import { OFFERED_LOCALES, type OfferedLocale } from "@/lib/i18n/locale";

/**
 * Pagine pubbliche del sito (T-1801…T-1805): l'unico elenco letto dal proxy (percorsi ammessi senza sessione, a match
 * esatto) e dalla sitemap. URL con prefisso per le lingue offerte (D-28 emendata): /it, /en, /es per es-ES e /es-419
 * per l'America Latina (T-4902), poi la pagina.
 * Modulo puro, senza accessi al server: lo usano anche la barra di navigazione e il footer lato client.
 */
export const MARKETING_PAGES = ["home", "pricing", "privacy", "terms", "cookies", "contact"] as const;
export type MarketingPage = (typeof MARKETING_PAGES)[number];

/** Primo segmento del percorso pubblico di ogni lingua (T-4902): lo spagnolo di Spagna è /es, quello d'America Latina /es-419. */
const SITE_SEGMENTS: Record<OfferedLocale, string> = { it: "it", en: "en", "es-ES": "es", "es-419": "es-419" };

/** Lingua di x-default negli hreflang (T-4902): la versione inglese della stessa pagina. */
const X_DEFAULT_LOCALE: OfferedLocale = "en";

export type MarketingRoute = {
  path: string;
  locale: OfferedLocale;
  page: MarketingPage;
  /** Stessa pagina in ogni lingua offerta (hreflang e selettore della lingua delle pagine pubbliche). */
  alternates: Record<OfferedLocale, string>;
  inSitemap: boolean;
};

// Il modulo contatti non va in sitemap: è una pagina di servizio, non un contenuto da indicizzare.
const SITEMAP_PAGES: ReadonlySet<MarketingPage> = new Set(["home", "pricing", "privacy", "terms", "cookies"]);

/** Lingua del segmento [lang] di una pagina pubblica (es → es-ES), null per ogni altro valore (anche es-ES). */
export function siteSegmentLocale(segment: string): OfferedLocale | null {
  return OFFERED_LOCALES.find((locale) => SITE_SEGMENTS[locale] === segment) ?? null;
}

/** Percorso di una pagina pubblica in una lingua: /it, /en/pricing, /es/terms, /es-419... */
export function marketingPath(page: MarketingPage, locale: OfferedLocale): string {
  const segment = SITE_SEGMENTS[locale];
  return page === "home" ? `/${segment}` : `/${segment}/${page}`;
}

function pagePaths(page: MarketingPage): Record<OfferedLocale, string> {
  return Object.fromEntries(OFFERED_LOCALES.map((locale) => [locale, marketingPath(page, locale)])) as Record<OfferedLocale, string>;
}

/** Hreflang di una pagina pubblica (T-4902): un percorso per lingua offerta e x-default verso la versione inglese. */
export function hreflangPaths(page: MarketingPage): Record<OfferedLocale | "x-default", string> {
  const paths = pagePaths(page);
  return { ...paths, "x-default": paths[X_DEFAULT_LOCALE] };
}

export const MARKETING_ROUTES: readonly MarketingRoute[] = MARKETING_PAGES.flatMap((page) => {
  const alternates = pagePaths(page);
  return OFFERED_LOCALES.map((locale) => ({
    path: marketingPath(page, locale),
    locale,
    page,
    alternates,
    inSitemap: SITEMAP_PAGES.has(page),
  }));
});

const ROUTES_BY_PATH = new Map(MARKETING_ROUTES.map((route) => [route.path, route]));

/** Voce dell'elenco per il percorso esatto (nessun prefisso, CWE-863), null per ogni altro percorso. */
export function findMarketingRoute(pathname: string): MarketingRoute | null {
  return ROUTES_BY_PATH.get(pathname) ?? null;
}
