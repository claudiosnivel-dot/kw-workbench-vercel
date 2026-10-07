import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Lingua per richiesta senza prefisso negli URL (T-1301): il plugin collega i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

// Header di sicurezza su tutte le risposte (T-505), come mappa nome → valore. La Content-Security-Policy
// a nonce la imposta il proxy.
const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  // Per i browser che non applicano frame-ancestors della CSP.
  "X-Frame-Options": "DENY",
  // HSTS solo sul deploy di produzione: le Preview e lo sviluppo locale restano fuori.
  ...(process.env.VERCEL_ENV === "production"
    ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" }
    : {}),
};

// Pagine con un token nell'URL: verifica dell'email e recupero password (T-1403, T-1404), invito in un workspace (T-1503).
const TOKEN_LINK_PAGES = ["/verify-email", "/forgot-password", "/reset-password", "/invites/accept"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(securityHeaders).map(([name, value]) => ({ key: name, value })),
      },
      // Pagine dei link con token nelle email (T-1403, T-1404): nessun Referer verso link o risorse esterne, così il
      // token nell'URL non esce dalla pagina. Una regola successiva con la stessa chiave sostituisce la precedente.
      ...TOKEN_LINK_PAGES.map((source) => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] })),
    ];
  },
};

// Sentry (T-601): SENTRY_AUTH_TOKEN serve solo in build per caricare le source map (senza token il caricamento
// si salta e la build prosegue); niente telemetria dell'SDK verso Sentry.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  suppressOnRouterTransitionStartWarning: true,
});
