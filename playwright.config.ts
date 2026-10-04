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

// Ogni variabile letta dall'app è esplicita: Next carica il .env locale solo per le variabili
// non impostate, quindi qui nessun valore del .env (DB reale, token Google) può prevalere.
const appEnv: Record<string, string> = {
  NEXT_TELEMETRY_DISABLED: "1",
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
  PRISMA_CONNECTION_LIMIT: "3",
  PRISMA_POOL_TIMEOUT: "15",
  APP_AUTH_ENABLED: "true",
  APP_AUTH_USERNAME: "e2e-bootstrap-admin",
  APP_AUTH_PASSWORD: "e2e-bootstrap-password-not-real",
  APP_PUBLIC_SIGNUP_ENABLED: "true",
  APP_SESSION_SECRET: testSecret(),
  APP_SESSION_MAX_AGE_SECONDS: "604800",
  APP_ENCRYPTION_KEY: testSecret(),
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
  GOOGLE_ADS_DEVELOPER_TOKEN: "",
  GOOGLE_ADS_CLIENT_ID: "",
  GOOGLE_ADS_CLIENT_SECRET: "",
  GOOGLE_ADS_CUSTOMER_ID: "",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "",
  GOOGLE_ADS_REFRESH_TOKEN: "",
  GOOGLE_ADS_REDIRECT_URI: "",
  GOOGLE_ADS_API_VERSION: "",
  GOOGLE_ADS_BATCH_SIZE: "",
  GOOGLE_ADS_METRICS_FILE: "",
  GOOGLE_SHEETS_OAUTH_CLIENT_ID: "",
  GOOGLE_SHEETS_OAUTH_CLIENT_SECRET: "",
  GOOGLE_SHEETS_OAUTH_REDIRECT_URI: "",
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
