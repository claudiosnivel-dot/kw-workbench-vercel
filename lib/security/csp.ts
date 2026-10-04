// Origine https dell'ingest di Sentry ricavata dal DSN del client (T-601): il browser invia lì gli eventi.
function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) {
    return null;
  }

  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy a nonce secondo la guida CSP di Next.js (T-505). Funzione pura: il proxy
 * genera il nonce per richiesta e passa la policy sia alla richiesta inoltrata sia alla risposta.
 * Con il DSN di Sentry del client, connect-src ammette anche l'host di ingest (T-601).
 */
export function buildCsp(nonce: string, isDev: boolean, sentryDsn?: string): string {
  const ingestOrigin = sentryIngestOrigin(sentryDsn);
  const directives = [
    "default-src 'self'",
    // React usa eval solo in sviluppo per gli stack degli errori del server.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Logo del branding remoto: solo https (T-506).
    "img-src 'self' blob: data: https:",
    // next/font/google serve i font dal dominio dell'app.
    "font-src 'self'",
    `connect-src 'self'${ingestOrigin ? ` ${ingestOrigin}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}
