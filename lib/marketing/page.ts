import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicAppUrl } from "@/lib/env";
import { type AppLocale, DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locale";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { type MarketingPage, marketingPath } from "@/lib/marketing/routes";

/** Props delle pagine sotto app/[lang] (T-1801): il segmento della lingua. */
export type LangPageProps = { params: Promise<{ lang: string }> };

/** Lingua del segmento [lang]: solo it ed en, ogni altro valore è una pagina inesistente (404), mai una route nuova. */
export async function marketingLocale({ params }: LangPageProps): Promise<AppLocale> {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) {
    notFound();
  }
  return lang;
}

const OPEN_GRAPH_LOCALES: Record<AppLocale, string> = { it: "it_IT", en: "en_US" };

// Immagine Open Graph 1200x630 di public/og/, servita senza sessione dal proxy.
const OPEN_GRAPH_IMAGE = { url: "/og/site.png", width: 1200, height: 630 };

/**
 * Metadata di una pagina pubblica (T-1801): titolo e descrizione dal catalogo della lingua del percorso, canonical,
 * hreflang verso le due lingue e x-default (/ per la landing, che reindirizza in base al browser; la versione italiana
 * di default per le altre pagine), Open Graph con il nome dell'app dal branding. URL assoluti da APP_PUBLIC_URL.
 */
export async function marketingMetadata(page: MarketingPage, props: LangPageProps): Promise<Metadata> {
  const locale = await marketingLocale(props);
  const [branding, t] = await Promise.all([getBrandingSnapshot(), getTranslations({ locale, namespace: "marketing.meta" })]);
  const title = `${t(`${page}.title`)} · ${branding.appName}`;
  const description = t(`${page}.description`);
  const path = marketingPath(page, locale);
  const publicUrl = getPublicAppUrl();

  return {
    ...(publicUrl ? { metadataBase: new URL(publicUrl) } : {}),
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        it: marketingPath(page, "it"),
        en: marketingPath(page, "en"),
        "x-default": page === "home" ? "/" : marketingPath(page, DEFAULT_LOCALE),
      },
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: branding.appName,
      locale: OPEN_GRAPH_LOCALES[locale],
      type: "website",
      images: [OPEN_GRAPH_IMAGE],
    },
  };
}

/** generateMetadata di una pagina pubblica a pagina fissa (landing, prezzi, contatti). */
export function marketingMetadataFor(page: MarketingPage): (props: LangPageProps) => Promise<Metadata> {
  return (props) => marketingMetadata(page, props);
}
