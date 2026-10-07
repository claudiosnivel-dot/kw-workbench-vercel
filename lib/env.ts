import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/email-address";

// Configurazione validata (T-201). Usata anche dal middleware in runtime edge: qui niente moduli
// solo-Node. Gli errori nominano la variabile e il vincolo violato, mai il valore.

export type EnvSource = Record<string, string | undefined>;

/** Interi letti dall'ambiente: default e intervallo ammesso, accanto a ogni variabile. */
export const INT_ENV = {
  APP_SESSION_MAX_AGE_SECONDS: { def: 604_800, min: 60, max: 31_536_000 },
  MAX_EXPANSION_QUERIES: { def: 250, min: 50, max: 5_000 },
  // Timeout della transazione finale dell'estrazione (T-706): il default di Prisma (5 s) non basta su un DB remoto.
  EXTRACTION_TX_TIMEOUT_MS: { def: 60_000, min: 5_000, max: 300_000 },
  // Estrazione a passi (T-1202): query di autocomplete per batch e durata di un passo del job.
  JOB_AUTOCOMPLETE_BATCH: { def: 24, min: 1, max: 500 },
  JOB_STEP_BUDGET_MS: { def: 60_000, min: 5_000, max: 240_000 },
  // Recupero dei job (T-1203): heartbeat fermo oltre il quale il job è bloccato e tetto di tentativi.
  JOB_STALE_AFTER_MS: { def: 180_000, min: 35_000, max: 3_600_000 },
  JOB_MAX_ATTEMPTS: { def: 5, min: 1, max: 20 },
  AUTOCOMPLETE_CONCURRENCY: { def: 6, min: 1, max: 20 },
  AUTOCOMPLETE_RATE_LIMIT_MS: { def: 180, min: 50, max: 10_000 },
  AUTOCOMPLETE_CACHE_TTL_MS: { def: 300_000, min: 30_000, max: 86_400_000 },
  AUTOCOMPLETE_MAX_RETRIES: { def: 2, min: 0, max: 5 },
  AUTOCOMPLETE_TIMEOUT_MS: { def: 4_500, min: 1_000, max: 30_000 },
  // Provider DataForSEO (T-909): timeout di ogni richiesta e tentativi per lotto (il primo compreso).
  DATAFORSEO_TIMEOUT_MS: { def: 30_000, min: 1_000, max: 120_000 },
  DATAFORSEO_MAX_ATTEMPTS: { def: 3, min: 1, max: 6 },
  // Il default effettivo dipende da NODE_ENV (lib/prisma.ts): 3 in produzione, 1 altrove.
  PRISMA_CONNECTION_LIMIT: { def: 3, min: 1, max: 50 },
  PRISMA_POOL_TIMEOUT: { def: 15, min: 1, max: 120 },
} as const;

type IntEnvKey = keyof typeof INT_ENV;

/**
 * Importi in USD letti dall'ambiente (T-903): decimali >= 0. I tetti valgono 0 se assenti (nessuna spesa ammessa
 * finché l'operatore non li imposta); il costo per richiesta stimato parte dal prezzo live verificato (D-30).
 */
export const USD_ENV = {
  METRICS_MONTHLY_BUDGET_USD: { def: 0 },
  METRICS_RUN_BUDGET_USD: { def: 0 },
  METRICS_COST_PER_REQUEST_USD: { def: 0.09 },
} as const;

type UsdEnvKey = keyof typeof USD_ENV;

/** Livelli del logger (T-602), dal più al meno verboso; LOG_LEVEL fissa il minimo (default info). */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
const DEFAULT_LOG_LEVEL: LogLevel = "info";

const AUTH_DISABLING_VALUES = new Set(["0", "false", "no", "off"]);
const SECRET_KEYS = ["APP_SESSION_SECRET", "APP_ENCRYPTION_KEY"] as const;
const MIN_SECRET_LENGTH = 32;
// Minimo raccomandato da Vercel per CRON_SECRET (T-1203).
const MIN_CRON_SECRET_LENGTH = 16;
// Il heartbeat di un job vivo si aggiorna almeno una volta per passo: la soglia di blocco supera il passo di 30 s.
const STALE_MARGIN_MS = 30_000;
const KNOWN_PLACEHOLDERS = new Set([
  "change-this-session-secret",
  "change-this-encryption-key",
  "replace-with-a-long-random-session-secret",
  "replace-with-a-long-random-encryption-key",
  "replace-with-a-long-random-job-signing-secret",
]);

const optional = z.string().optional();

/** Trasporti delle email transazionali (T-1402, D-11): Resend in produzione, outbox senza rete altrove. */
export const EMAIL_TRANSPORTS = ["resend", "outbox"] as const;
export type EmailTransport = (typeof EMAIL_TRANSPORTS)[number];
// Mittente: un indirizzo, da solo o come «Nome <indirizzo>»; niente ritorni a capo (CWE-93).
const EMAIL_FROM_PATTERN = /^(?:[^<>\r\n]*<([^<>\r\n]+)>|([^<>\r\n]+))$/;
const SENTRY_DSN_KEYS = ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"] as const;

const envSchema = z.object({
  NODE_ENV: optional,
  APP_AUTH_ENABLED: optional,
  // Email del root admin iniziale (T-1401): obbligatoria in produzione.
  APP_ADMIN_EMAIL: optional,
  APP_PUBLIC_SIGNUP_ENABLED: optional,
  APP_SESSION_SECRET: optional,
  APP_SESSION_MAX_AGE_SECONDS: optional,
  APP_ENCRYPTION_KEY: optional,
  APP_COOKIE_SECURE: optional,
  APP_BRAND_NAME: optional,
  APP_BRAND_LOGO_URL: optional,
  APP_BRAND_LOGO_URL_DARK: optional,
  APP_BRAND_LOGO_URL_LIGHT: optional,
  DATABASE_URL: optional,
  DIRECT_URL: optional,
  // Solo nell'ambiente Preview: identità del DB di produzione per la guardia del build (T-202).
  PRODUCTION_DB_HOST: optional,
  PRISMA_CONNECTION_LIMIT: optional,
  PRISMA_POOL_TIMEOUT: optional,
  MAX_EXPANSION_QUERIES: optional,
  EXTRACTION_TX_TIMEOUT_MS: optional,
  JOB_AUTOCOMPLETE_BATCH: optional,
  JOB_STEP_BUDGET_MS: optional,
  JOB_STALE_AFTER_MS: optional,
  JOB_MAX_ATTEMPTS: optional,
  // Job in background (T-1203): firma delle chiamate interne, segreto del cron di Vercel, URL pubblico dell'app per
  // le chiamate interne fuori da Vercel. VERCEL_URL e VERCEL_AUTOMATION_BYPASS_SECRET sono variabili di sistema.
  JOB_SIGNING_SECRET: optional,
  CRON_SECRET: optional,
  APP_PUBLIC_URL: optional,
  // Email transazionali (T-1402, D-11): trasporto, chiave API di Resend e mittente.
  EMAIL_TRANSPORT: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  VERCEL_URL: optional,
  VERCEL_AUTOMATION_BYPASS_SECRET: optional,
  AUTOCOMPLETE_TIMEOUT_MS: optional,
  AUTOCOMPLETE_MAX_RETRIES: optional,
  AUTOCOMPLETE_RATE_LIMIT_MS: optional,
  AUTOCOMPLETE_CACHE_TTL_MS: optional,
  AUTOCOMPLETE_CONCURRENCY: optional,
  GOOGLE_AUTOCOMPLETE_ENDPOINT: optional,
  GOOGLE_AUTOCOMPLETE_CLIENT: optional,
  // Fornitore di metriche con licenza (T-902, D-30): credenziali dell'account API, mai in DB né nei log.
  DATAFORSEO_LOGIN: optional,
  DATAFORSEO_PASSWORD: optional,
  DATAFORSEO_TIMEOUT_MS: optional,
  DATAFORSEO_MAX_ATTEMPTS: optional,
  METRICS_MONTHLY_BUDGET_USD: optional,
  METRICS_RUN_BUDGET_USD: optional,
  METRICS_COST_PER_REQUEST_USD: optional,
  GOOGLE_SHEETS_OAUTH_CLIENT_ID: optional,
  GOOGLE_SHEETS_OAUTH_CLIENT_SECRET: optional,
  GOOGLE_SHEETS_OAUTH_REDIRECT_URI: optional,
  // Sentry (T-601): senza DSN l'SDK non si inizializza. Token, org e progetto servono solo in build per le source map.
  SENTRY_DSN: optional,
  NEXT_PUBLIC_SENTRY_DSN: optional,
  SENTRY_AUTH_TOKEN: optional,
  SENTRY_ORG: optional,
  SENTRY_PROJECT: optional,
  LOG_LEVEL: optional,
});

type RawEnv = z.infer<typeof envSchema>;

/** Variabili d'ambiente dichiarate dall'app. */
export const ENV_KEYS = Object.keys(envSchema.shape) as (keyof RawEnv)[];

export type Env = {
  isProduction: boolean;
  authEnabled: boolean;
  // Senza default: assenti fuori produzione, l'errore arriva al primo uso (lib/auth/config.ts).
  sessionSecret: string | undefined;
  encryptionKey: string | undefined;
  sessionMaxAgeSeconds: number;
};

function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

function isAuthEnabledValue(raw: string | undefined): boolean {
  return !AUTH_DISABLING_VALUES.has((raw ?? "").trim().toLowerCase());
}

// URL pubblico dell'app: https, oppure http solo per localhost (sviluppo ed E2E).
function isPublicAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local);
  } catch {
    return false;
  }
}

// DSN di Sentry: https://<chiave pubblica>@<host>/<id numerico del progetto>.
function isSentryDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username !== "" && /\/\d+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isEmailFrom(value: string): boolean {
  const match = EMAIL_FROM_PATTERN.exec(value);
  return match !== null && normalizeEmail(match[1] ?? match[2]) !== null;
}

function checkSecret(value: string | undefined): string | null {
  if (value === undefined) {
    return "è obbligatoria in produzione";
  }
  if (KNOWN_PLACEHOLDERS.has(value)) {
    return "non può essere un valore segnaposto noto";
  }
  if (value.length < MIN_SECRET_LENGTH) {
    return `deve avere almeno ${MIN_SECRET_LENGTH} caratteri`;
  }
  return null;
}

/** Intero da env: assente o vuoto -> def; non intero -> errore; fuori da [min, max] -> riportato nell'intervallo. */
export function envInt(name: string, def: number, min: number, max: number, source: EnvSource = process.env): number {
  const raw = present(source[name])?.trim();
  if (raw === undefined) {
    return def;
  }
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`${name} deve essere un numero intero`);
  }
  return Math.min(max, Math.max(min, Number(raw)));
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/** Livello minimo del logger: assente o vuoto -> info. Un valore non ammesso è già un errore di parseEnv. */
export function getLogLevel(source: EnvSource = process.env): LogLevel {
  const raw = present(source.LOG_LEVEL)?.trim().toLowerCase();
  return raw !== undefined && isLogLevel(raw) ? raw : DEFAULT_LOG_LEVEL;
}

export function getIntEnv(name: IntEnvKey, source: EnvSource = process.env): number {
  const { def, min, max } = INT_ENV[name];
  return envInt(name, def, min, max, source);
}

/** Importo in USD da env: assente o vuoto -> default; non decimale o negativo -> errore. */
export function getUsdEnv(name: UsdEnvKey, source: EnvSource = process.env): number {
  const raw = present(source[name])?.trim();
  if (raw === undefined) {
    return USD_ENV[name].def;
  }
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`${name} deve essere un importo decimale maggiore o uguale a 0`);
  }
  return Number(raw);
}

const validatedSchema = envSchema.superRefine((raw, ctx) => {
  const isProduction = raw.NODE_ENV === "production";

  if (isProduction && !isAuthEnabledValue(raw.APP_AUTH_ENABLED)) {
    ctx.addIssue({
      code: "custom",
      path: ["APP_AUTH_ENABLED"],
      message: "in produzione l'autenticazione non si può disattivare",
    });
  }

  if (isProduction) {
    for (const name of SECRET_KEYS) {
      const problem = checkSecret(present(raw[name]));
      if (problem) {
        ctx.addIssue({ code: "custom", path: [name], message: problem });
      }
    }
  }

  const jobSecret = present(raw.JOB_SIGNING_SECRET);
  if (isProduction || jobSecret !== undefined) {
    const problem = checkSecret(jobSecret);
    if (problem) {
      ctx.addIssue({ code: "custom", path: ["JOB_SIGNING_SECRET"], message: problem });
    } else if (jobSecret === present(raw.APP_SESSION_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["JOB_SIGNING_SECRET"], message: "deve essere diversa da APP_SESSION_SECRET" });
    }
  }

  const cronSecret = present(raw.CRON_SECRET);
  if (cronSecret !== undefined && cronSecret.length < MIN_CRON_SECRET_LENGTH) {
    ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: `deve avere almeno ${MIN_CRON_SECRET_LENGTH} caratteri` });
  }

  const publicUrl = present(raw.APP_PUBLIC_URL)?.trim();
  if (publicUrl !== undefined && !isPublicAppUrl(publicUrl)) {
    ctx.addIssue({ code: "custom", path: ["APP_PUBLIC_URL"], message: "deve essere un URL https (http solo per localhost)" });
  }

  const adminEmail = present(raw.APP_ADMIN_EMAIL);
  if (adminEmail === undefined ? isProduction : normalizeEmail(adminEmail) === null) {
    const message = adminEmail === undefined ? "è obbligatoria in produzione" : "deve essere un indirizzo email valido";
    ctx.addIssue({ code: "custom", path: ["APP_ADMIN_EMAIL"], message });
  }

  checkEmailSettings(raw, isProduction, ctx);

  try {
    if (getIntEnv("JOB_STALE_AFTER_MS", raw) < getIntEnv("JOB_STEP_BUDGET_MS", raw) + STALE_MARGIN_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["JOB_STALE_AFTER_MS"],
        message: `deve superare JOB_STEP_BUDGET_MS di almeno ${STALE_MARGIN_MS}`,
      });
    }
  } catch {
    // Un valore non intero è già segnalato dal controllo degli interi qui sotto.
  }

  for (const name of SENTRY_DSN_KEYS) {
    const dsn = present(raw[name]);
    if (dsn !== undefined && !isSentryDsn(dsn)) {
      ctx.addIssue({ code: "custom", path: [name], message: "deve essere un DSN di Sentry (https://<chiave>@<host>/<progetto>)" });
    }
  }

  const logLevel = present(raw.LOG_LEVEL)?.trim().toLowerCase();
  if (logLevel !== undefined && !isLogLevel(logLevel)) {
    ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: `deve essere uno tra ${LOG_LEVELS.join(", ")}` });
  }

  for (const name of Object.keys(USD_ENV) as UsdEnvKey[]) {
    try {
      getUsdEnv(name, raw);
    } catch {
      ctx.addIssue({ code: "custom", path: [name], message: "deve essere un importo decimale maggiore o uguale a 0" });
    }
  }

  for (const name of Object.keys(INT_ENV) as IntEnvKey[]) {
    const { min, max } = INT_ENV[name];
    try {
      getIntEnv(name, raw);
    } catch {
      ctx.addIssue({ code: "custom", path: [name], message: `deve essere un intero tra ${min} e ${max}` });
    }
  }
});

/**
 * Email transazionali (T-1402): in produzione il trasporto è resend e servono RESEND_API_KEY, EMAIL_FROM e
 * APP_PUBLIC_URL (base dei link nelle email, mai l'header Host); altrove il default è outbox.
 */
function checkEmailSettings(raw: RawEnv, isProduction: boolean, ctx: z.RefinementCtx): void {
  const transport = present(raw.EMAIL_TRANSPORT)?.trim();
  if (transport !== undefined && !isEmailTransport(transport)) {
    ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: `deve essere uno tra ${EMAIL_TRANSPORTS.join(", ")}` });
  } else if (isProduction && transport !== "resend") {
    ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "in produzione deve valere resend" });
  }

  const from = present(raw.EMAIL_FROM)?.trim();
  if (from !== undefined && !isEmailFrom(from)) {
    ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "deve essere un indirizzo email, anche nella forma Nome <indirizzo>" });
  }

  if (isProduction) {
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM", "APP_PUBLIC_URL"] as const) {
      if (present(raw[name]) === undefined) {
        ctx.addIssue({ code: "custom", path: [name], message: "è obbligatoria in produzione" });
      }
    }
  }
}

function isEmailTransport(value: string): value is EmailTransport {
  return (EMAIL_TRANSPORTS as readonly string[]).includes(value);
}

/** Valida una sorgente di variabili d'ambiente; lancia un errore che elenca le variabili errate. */
export function parseEnv(source: EnvSource): Env {
  const result = validatedSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
    throw new Error(`Configurazione non valida: ${problems.join("; ")}`);
  }

  const raw = result.data;
  const isProduction = raw.NODE_ENV === "production";

  return {
    isProduction,
    authEnabled: isAuthEnabledValue(raw.APP_AUTH_ENABLED),
    sessionSecret: present(raw.APP_SESSION_SECRET),
    encryptionKey: present(raw.APP_ENCRYPTION_KEY),
    sessionMaxAgeSeconds: getIntEnv("APP_SESSION_MAX_AGE_SECONDS", raw),
  };
}

/** Credenziali DataForSEO dall'ambiente; null se una delle due manca (provider non configurato). */
export function getDataForSeoCredentials(source: EnvSource = process.env): { login: string; password: string } | null {
  const login = present(source.DATAFORSEO_LOGIN)?.trim();
  const password = present(source.DATAFORSEO_PASSWORD);
  return login && password ? { login, password } : null;
}

/** Segreto HMAC delle chiamate interne dei job (T-1203); assente fuori produzione se non configurato. */
export function getJobSigningSecret(source: EnvSource = process.env): string | undefined {
  return present(source.JOB_SIGNING_SECRET);
}

/** Segreto che Vercel invia al cron come Authorization: Bearer (T-1203); assente -> il cron risponde 401. */
export function getCronSecret(source: EnvSource = process.env): string | undefined {
  return present(source.CRON_SECRET);
}

/**
 * Base delle chiamate interne dei job (T-1203): https:// + VERCEL_URL su Vercel (la stessa deployment, quindi la
 * stessa versione del codice), APP_PUBLIC_URL altrove, null se nessuna delle due. Mai derivata dall'header Host.
 */
export function getInternalBaseUrl(source: EnvSource = process.env): string | null {
  const vercelUrl = present(source.VERCEL_URL)?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }
  return getPublicAppUrl(source);
}

/** Email normalizzata del root admin iniziale (T-1401); null se APP_ADMIN_EMAIL manca (ammesso fuori produzione). */
export function getAdminEmail(source: EnvSource = process.env): string | null {
  return normalizeEmail(present(source.APP_ADMIN_EMAIL));
}

/** Trasporto delle email (T-1402): EMAIL_TRANSPORT, default outbox (in produzione parseEnv impone resend). */
export function getEmailTransport(source: EnvSource = process.env): EmailTransport {
  const raw = present(source.EMAIL_TRANSPORT)?.trim();
  return raw !== undefined && isEmailTransport(raw) ? raw : "outbox";
}

/** Chiave API e mittente di Resend (T-1402); null se una delle due manca. */
export function getResendSettings(source: EnvSource = process.env): { apiKey: string; from: string } | null {
  const apiKey = present(source.RESEND_API_KEY)?.trim();
  const from = present(source.EMAIL_FROM)?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** URL pubblico dell'app senza barra finale (T-1402): l'unica base dei link nelle email; null se non impostato. */
export function getPublicAppUrl(source: EnvSource = process.env): string | null {
  return present(source.APP_PUBLIC_URL)?.trim().replace(/\/+$/, "") ?? null;
}

/** Segreto di Protection Bypass for Automation di Vercel, se attivo sul progetto. */
export function getProtectionBypassSecret(source: EnvSource = process.env): string | undefined {
  return present(source.VERCEL_AUTOMATION_BYPASS_SECRET);
}

let cachedEnv: Env | undefined;

/** Configurazione del processo, validata alla prima lettura e poi memoizzata. */
export function getEnv(): Env {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
