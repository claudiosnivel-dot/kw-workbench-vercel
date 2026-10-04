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

export default nextConfig;
