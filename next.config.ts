import type { NextConfig } from "next";

// Header di sicurezza su tutte le risposte (T-505). La Content-Security-Policy a nonce la imposta il proxy.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Per i browser che non applicano frame-ancestors della CSP.
  { key: "X-Frame-Options", value: "DENY" },
  // HSTS solo sul deploy di produzione: le Preview e lo sviluppo locale restano fuori.
  ...(process.env.VERCEL_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
