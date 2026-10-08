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

// Overlay del checkout di Paddle.js (T-1602): iframe dal dominio di checkout dell'ambiente e fogli di stile dal CDN di
// Paddle. Lo script di Paddle.js lo inserisce il bundle dell'app (nonce e strict-dynamic), quindi script-src non cambia.
// Host dalle tabelle d'ambiente di Paddle.js v2, da confermare con il primo checkout sandbox.
const PADDLE_CHECKOUT_HOSTS: Record<string, { frame: string; styles: string }> = {
  sandbox: { frame: "https://sandbox-buy.paddle.com", styles: "https://cdn.paddle.com https://sandbox-cdn.paddle.com" },
  production: { frame: "https://buy.paddle.com", styles: "https://cdn.paddle.com" },
};

// Widget di Cloudflare Turnstile (T-1702): script e iframe della sfida.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Content-Security-Policy a nonce secondo la guida CSP di Next.js (T-505). Funzione pura: il proxy
 * genera il nonce per richiesta e passa la policy sia alla richiesta inoltrata sia alla risposta.
 * Con il DSN di Sentry del client, connect-src ammette anche l'host di ingest (T-601). Con PADDLE_ENV configurata
 * frame-src e style-src ammettono il checkout di Paddle di quell'ambiente (T-1602); senza, nulla cambia. Con la site key
 * di Turnstile script-src e frame-src ammettono challenges.cloudflare.com (T-1702): lo script lo inserisce il bundle
 * (strict-dynamic), l'host in script-src vale per i browser senza strict-dynamic; senza la site key nulla cambia.
 */
export function buildCsp(
  nonce: string,
  isDev: boolean,
  sentryDsn?: string,
  paddleEnvironment?: string,
  turnstile = false
): string {
  const ingestOrigin = sentryIngestOrigin(sentryDsn);
  const paddle =
    paddleEnvironment && Object.hasOwn(PADDLE_CHECKOUT_HOSTS, paddleEnvironment) ? PADDLE_CHECKOUT_HOSTS[paddleEnvironment] : undefined;
  const directives = [
    "default-src 'self'",
    // React usa eval solo in sviluppo per gli stack degli errori del server.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${turnstile ? ` ${TURNSTILE_ORIGIN}` : ""}`,
    `style-src 'self' 'nonce-${nonce}'${paddle ? ` ${paddle.styles}` : ""}`,
    ...(paddle || turnstile
      ? [`frame-src 'self'${paddle ? ` ${paddle.frame}` : ""}${turnstile ? ` ${TURNSTILE_ORIGIN}` : ""}`]
      : []),
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
