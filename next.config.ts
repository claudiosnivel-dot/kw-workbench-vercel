import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(securityHeaders).map(([name, value]) => ({ key: name, value })),
      },
    ];
  },
};

// Sentry (T-601): SENTRY_AUTH_TOKEN serve solo in build per caricare le source map (senza token il caricamento
// si salta e la build prosegue); niente telemetria dell'SDK verso Sentry.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  suppressOnRouterTransitionStartWarning: true,
});
