import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/env";

const DEVELOPMENT_URL = "http://localhost:3000";

// Aree dell'app: robots.txt non è un controllo d'accesso, restano protette dal proxy (T-1801, CWE-200).
const APP_AREAS = ["/api/", "/projects", "/admin", "/onboarding", "/personalizza", "/workspace", "/billing", "/account", "/invites"];

/** robots.txt (T-1801): pagine pubbliche indicizzabili, aree dell'app escluse, sitemap con URL assoluto. */
export default function robots(): MetadataRoute.Robots {
  const base = getPublicAppUrl() ?? DEVELOPMENT_URL;
  return {
    rules: { userAgent: "*", allow: "/", disallow: APP_AREAS },
    sitemap: `${base}/sitemap.xml`,
  };
}
