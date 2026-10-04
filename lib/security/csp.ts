/**
 * Content-Security-Policy a nonce secondo la guida CSP di Next.js (T-505). Funzione pura: il proxy
 * genera il nonce per richiesta e passa la policy sia alla richiesta inoltrata sia alla risposta.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // React usa eval solo in sviluppo per gli stack degli errori del server.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Logo del branding remoto: solo https (T-506).
    "img-src 'self' blob: data: https:",
    // next/font/google serve i font dal dominio dell'app.
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}
