import { z } from "zod";

// Configurazione validata (T-201). Usata anche dal middleware in runtime edge: qui niente moduli
// solo-Node. Gli errori nominano la variabile e il vincolo violato, mai il valore.

export type EnvSource = Record<string, string | undefined>;

/** Interi letti dall'ambiente: default e intervallo ammesso, accanto a ogni variabile. */
export const INT_ENV = {
  APP_SESSION_MAX_AGE_SECONDS: { def: 604_800, min: 60, max: 31_536_000 },
  MAX_EXPANSION_QUERIES: { def: 250, min: 50, max: 5_000 },
  AUTOCOMPLETE_CONCURRENCY: { def: 6, min: 1, max: 20 },
  AUTOCOMPLETE_RATE_LIMIT_MS: { def: 180, min: 50, max: 10_000 },
  AUTOCOMPLETE_CACHE_TTL_MS: { def: 300_000, min: 30_000, max: 86_400_000 },
  AUTOCOMPLETE_MAX_RETRIES: { def: 2, min: 0, max: 5 },
  AUTOCOMPLETE_TIMEOUT_MS: { def: 4_500, min: 1_000, max: 30_000 },
  // Il default effettivo dipende da NODE_ENV (lib/prisma.ts): 3 in produzione, 1 altrove.
  PRISMA_CONNECTION_LIMIT: { def: 3, min: 1, max: 50 },
  PRISMA_POOL_TIMEOUT: { def: 15, min: 1, max: 120 },
} as const;

type IntEnvKey = keyof typeof INT_ENV;

const AUTH_DISABLING_VALUES = new Set(["0", "false", "no", "off"]);
const SECRET_KEYS = ["APP_SESSION_SECRET", "APP_ENCRYPTION_KEY"] as const;
const MIN_SECRET_LENGTH = 32;
const KNOWN_PLACEHOLDERS = new Set([
  "change-this-session-secret",
  "change-this-encryption-key",
  "replace-with-a-long-random-session-secret",
  "replace-with-a-long-random-encryption-key",
]);
// Valori di sviluppo e test, mai accettati in produzione (vedi checkSecret).
const NON_PRODUCTION_FALLBACK = {
  APP_SESSION_SECRET: "change-this-session-secret",
  APP_ENCRYPTION_KEY: "change-this-encryption-key",
} as const;

const optional = z.string().optional();

const envSchema = z.object({
  NODE_ENV: optional,
  APP_AUTH_ENABLED: optional,
  APP_AUTH_USERNAME: optional,
  APP_AUTH_PASSWORD: optional,
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
  PRISMA_CONNECTION_LIMIT: optional,
  PRISMA_POOL_TIMEOUT: optional,
  MAX_EXPANSION_QUERIES: optional,
  AUTOCOMPLETE_TIMEOUT_MS: optional,
  AUTOCOMPLETE_MAX_RETRIES: optional,
  AUTOCOMPLETE_RATE_LIMIT_MS: optional,
  AUTOCOMPLETE_CACHE_TTL_MS: optional,
  AUTOCOMPLETE_CONCURRENCY: optional,
  GOOGLE_AUTOCOMPLETE_ENDPOINT: optional,
  GOOGLE_AUTOCOMPLETE_CLIENT: optional,
  GOOGLE_ADS_DEVELOPER_TOKEN: optional,
  GOOGLE_ADS_CLIENT_ID: optional,
  GOOGLE_ADS_CLIENT_SECRET: optional,
  GOOGLE_ADS_CUSTOMER_ID: optional,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optional,
  GOOGLE_ADS_REFRESH_TOKEN: optional,
  GOOGLE_ADS_REDIRECT_URI: optional,
  GOOGLE_ADS_API_VERSION: optional,
  GOOGLE_ADS_BATCH_SIZE: optional,
  GOOGLE_ADS_METRICS_FILE: optional,
  GOOGLE_SHEETS_OAUTH_CLIENT_ID: optional,
  GOOGLE_SHEETS_OAUTH_CLIENT_SECRET: optional,
  GOOGLE_SHEETS_OAUTH_REDIRECT_URI: optional,
});

type RawEnv = z.infer<typeof envSchema>;

/** Variabili d'ambiente dichiarate dall'app. */
export const ENV_KEYS = Object.keys(envSchema.shape) as (keyof RawEnv)[];

export type Env = {
  isProduction: boolean;
  authEnabled: boolean;
  authUsername: string;
  authPassword: string | undefined;
  sessionSecret: string;
  encryptionKey: string;
  sessionMaxAgeSeconds: number;
};

function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

function isAuthEnabledValue(raw: string | undefined): boolean {
  return !AUTH_DISABLING_VALUES.has((raw ?? "").trim().toLowerCase());
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

export function getIntEnv(name: IntEnvKey, source: EnvSource = process.env): number {
  const { def, min, max } = INT_ENV[name];
  return envInt(name, def, min, max, source);
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

  for (const name of Object.keys(INT_ENV) as IntEnvKey[]) {
    const { min, max } = INT_ENV[name];
    try {
      getIntEnv(name, raw);
    } catch {
      ctx.addIssue({ code: "custom", path: [name], message: `deve essere un intero tra ${min} e ${max}` });
    }
  }
});

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
    authUsername: raw.APP_AUTH_USERNAME ?? "admin",
    authPassword: present(raw.APP_AUTH_PASSWORD),
    sessionSecret: present(raw.APP_SESSION_SECRET) ?? NON_PRODUCTION_FALLBACK.APP_SESSION_SECRET,
    encryptionKey: present(raw.APP_ENCRYPTION_KEY) ?? NON_PRODUCTION_FALLBACK.APP_ENCRYPTION_KEY,
    sessionMaxAgeSeconds: getIntEnv("APP_SESSION_MAX_AGE_SECONDS", raw),
  };
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
