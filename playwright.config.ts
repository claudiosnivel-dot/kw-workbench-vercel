import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { assertLocalTestDatabase } from "./tests/helpers/db-guard";

const PORT = 3100;

// Solo il Postgres di test locale: un TEST_DATABASE_URL remoto ferma Playwright prima del build.
const testDatabaseUrl = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
// Il global setup importa il client Prisma, un singleton che legge DATABASE_URL all'import:
// nel processo di Playwright punta solo al DB di test.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = testDatabaseUrl;

// Segreti di test generati a ogni esecuzione: lunghi 48 caratteri, mai valori reali né placeholder.
const testSecret = () => randomBytes(24).toString("hex");

// Segreti condivisi con i worker dei test, che ereditano l'ambiente del processo principale (il config si rivaluta nei
// worker, ??= conserva il valore ereditato): gli E2E di fatturazione (T-1604) scrivono app_settings cifrata e firmano i
// webhook di Paddle come il server.
process.env.E2E_APP_ENCRYPTION_KEY ??= testSecret();
process.env.E2E_PADDLE_WEBHOOK_SECRET ??= `pdl_ntfset_${testSecret()}`;

// Ogni variabile letta dall'app è esplicita: Next carica il .env locale solo per le variabili
// non impostate, quindi qui nessun valore del .env (DB reale, token Google) può prevalere.
const appEnv: Record<string, string> = {
  NEXT_TELEMETRY_DISABLED: "1",
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
  PRISMA_CONNECTION_LIMIT: "3",
  PRISMA_POOL_TIMEOUT: "15",
  APP_AUTH_ENABLED: "true",
  // Root admin del bootstrap (T-1401): l'utente seed è già root admin, quindi il bootstrap non scatta.
  APP_ADMIN_EMAIL: "e2e-bootstrap-admin@example.test",
  APP_PUBLIC_SIGNUP_ENABLED: "true",
  APP_SESSION_SECRET: testSecret(),
  APP_SESSION_MAX_AGE_SECONDS: "604800",
  APP_ENCRYPTION_KEY: process.env.E2E_APP_ENCRYPTION_KEY,
  // Job in background (T-1203): firma dei passi e chiamate interne verso il server degli E2E.
  JOB_SIGNING_SECRET: testSecret(),
  APP_PUBLIC_URL: `http://localhost:${PORT}`,
  // next start gira in produzione, dove il trasporto delle email è resend (T-1402): chiave e mittente fittizi, gli
  // E2E non inviano email.
  EMAIL_TRANSPORT: "resend",
  RESEND_API_KEY: `re_e2e_${testSecret()}`,
  EMAIL_FROM: "noreply@example.test",
  APP_COOKIE_SECURE: "false",
  APP_BRAND_NAME: "Seo God Mode",
  APP_BRAND_LOGO_URL: "",
  APP_BRAND_LOGO_URL_DARK: "",
  APP_BRAND_LOGO_URL_LIGHT: "",
  MAX_EXPANSION_QUERIES: "250",
  AUTOCOMPLETE_TIMEOUT_MS: "4500",
  AUTOCOMPLETE_MAX_RETRIES: "2",
  AUTOCOMPLETE_RATE_LIMIT_MS: "180",
  AUTOCOMPLETE_CACHE_TTL_MS: "300000",
  AUTOCOMPLETE_CONCURRENCY: "6",
  GOOGLE_AUTOCOMPLETE_ENDPOINT: "",
  GOOGLE_AUTOCOMPLETE_CLIENT: "",
  GOOGLE_SHEETS_OAUTH_CLIENT_ID: "",
  GOOGLE_SHEETS_OAUTH_CLIENT_SECRET: "",
  GOOGLE_SHEETS_OAUTH_REDIRECT_URI: "",
  // Rate limit (T-1701): gli E2E accedono molte volte con lo stesso utente dallo stesso IP (fuori da Vercel vale
  // 'unknown'), quindi soglie alte; le soglie basse sono provate dai test d'integrazione.
  RATE_LIMIT_LOGIN_IP_EMAIL_MAX: "10000",
  RATE_LIMIT_LOGIN_IP_MAX: "100000",
  RATE_LIMIT_RUN_START_MAX: "10000",
  // Paddle sandbox senza chiave API (T-1603, T-1604): i webhook firmati sì, nessuna chiamata all'API di Paddle.
  PADDLE_ENV: "sandbox",
  PADDLE_WEBHOOK_SECRET: process.env.E2E_PADDLE_WEBHOOK_SECRET,
};

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // In CI una baseline mancante è un errore e non viene creata.
  updateSnapshots: process.env.CI ? "none" : "missing",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    // La porta e non un URL: il global setup migra il DB dopo l'avvio del server.
    port: PORT,
    reuseExistingServer: false,
    timeout: 600_000,
    env: appEnv,
  },
});
