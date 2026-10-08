import { type AppLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";

/**
 * Pagine pubbliche del sito (T-1801…T-1805): l'unico elenco letto dal proxy (percorsi ammessi senza sessione, a match
 * esatto) e dalla sitemap. URL con prefisso per entrambe le lingue (D-28 emendata): /it e /en, poi la pagina.
 * Modulo puro, senza accessi al server: lo usano anche la barra di navigazione e il footer lato client.
 */
export const MARKETING_PAGES = ["home", "pricing", "privacy", "terms", "cookies", "contact"] as const;
export type MarketingPage = (typeof MARKETING_PAGES)[number];

export type MarketingRoute = {
  path: string;
  locale: AppLocale;
  page: MarketingPage;
  /** Stessa pagina nell'altra lingua (hreflang e selettore della lingua). */
  alternate: string;
  inSitemap: boolean;
};

// Il modulo contatti non va in sitemap: è una pagina di servizio, non un contenuto da indicizzare.
const SITEMAP_PAGES: ReadonlySet<MarketingPage> = new Set(["home", "pricing", "privacy", "terms", "cookies"]);

/** Percorso di una pagina pubblica in una lingua: /it, /en/pricing, /it/terms... */
export function marketingPath(page: MarketingPage, locale: AppLocale): string {
  return page === "home" ? `/${locale}` : `/${locale}/${page}`;
}

function otherLocale(locale: AppLocale): AppLocale {
  return locale === "it" ? "en" : "it";
}

export const MARKETING_ROUTES: readonly MarketingRoute[] = MARKETING_PAGES.flatMap((page) =>
  SUPPORTED_LOCALES.map((locale) => ({
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
