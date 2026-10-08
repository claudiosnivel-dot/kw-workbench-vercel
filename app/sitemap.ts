import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/env";
import { MARKETING_ROUTES } from "@/lib/marketing/routes";

// Senza APP_PUBLIC_URL (solo fuori produzione, T-201) la base è il server di sviluppo.
const DEVELOPMENT_URL = "http://localhost:3000";

/** Sitemap delle pagine pubbliche (T-1801): URL assoluti delle voci con inSitemap e hreflang verso le due lingue. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicAppUrl() ?? DEVELOPMENT_URL;
  return MARKETING_ROUTES.filter((route) => route.inSitemap).map((route) => ({
    url: `${base}${route.path}`,
    alternates: {
      languages: {
        [route.locale]: `${base}${route.path}`,
        [route.locale === "it" ? "en" : "it"]: `${base}${route.alternate}`,
      },
    },
  }));
}
