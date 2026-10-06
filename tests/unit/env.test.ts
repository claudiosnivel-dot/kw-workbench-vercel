// Gate di T-201: configurazione validata e fail-closed (AC-201-1, AC-201-2, AC-201-3).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envInt, parseEnv } from "@/lib/env";

// Segreto fittizio conforme ai vincoli di produzione (almeno 32 caratteri), mai un valore reale.
const VALID_SECRET = "x".repeat(40);
const PRODUCTION = {
  NODE_ENV: "production",
  APP_SESSION_SECRET: VALID_SECRET,
  APP_ENCRYPTION_KEY: VALID_SECRET,
};

function errorMessageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("nessun errore lanciato");
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("APP_AUTH_ENABLED fail-closed", () => {
  // covers: AC-201-1
  it("un refuso lascia l'auth attiva e in produzione disattivarla è un errore che nomina la variabile", () => {
    expect(parseEnv({ NODE_ENV: "development", APP_AUTH_ENABLED: "ture" }).authEnabled).toBe(true);
    expect(() => parseEnv({ ...PRODUCTION, APP_AUTH_ENABLED: "false" })).toThrow(/APP_AUTH_ENABLED/);
  });
});

describe("segreti obbligatori in produzione", () => {
  const cases = [
    { name: "APP_SESSION_SECRET", placeholder: "change-this-session-secret" },
    { name: "APP_ENCRYPTION_KEY", placeholder: "change-this-encryption-key" },
  ] as const;

  for (const { name, placeholder } of cases) {
    // covers: AC-201-2
    it(`${name} assente, segnaposto o corta: l'errore nomina la variabile e non il valore`, () => {
      for (const value of [undefined, placeholder, "a".repeat(31)]) {
        const message = errorMessageOf(() => parseEnv({ ...PRODUCTION, [name]: value }));

        expect(message).toContain(name);
        if (value !== undefined) {
          expect(message).not.toContain(value);
        }
      }
    });
  }
});

describe("variabili dei job in background (T-1203)", () => {
  it("JOB_SIGNING_SECRET è obbligatoria in produzione, lunga almeno 32 caratteri e diversa da APP_SESSION_SECRET", () => {
    expect(errorMessageOf(() => parseEnv(PRODUCTION))).toContain("JOB_SIGNING_SECRET è obbligatoria in produzione");
    expect(() => parseEnv({ ...PRODUCTION, JOB_SIGNING_SECRET: "j".repeat(40) })).not.toThrow();
    expect(errorMessageOf(() => parseEnv({ ...PRODUCTION, JOB_SIGNING_SECRET: "j".repeat(31) }))).toContain(
      "JOB_SIGNING_SECRET"
    );
    expect(errorMessageOf(() => parseEnv({ ...PRODUCTION, JOB_SIGNING_SECRET: VALID_SECRET }))).toContain(
      "JOB_SIGNING_SECRET deve essere diversa da APP_SESSION_SECRET"
    );
  });

  it("rifiuta CRON_SECRET corta, APP_PUBLIC_URL http fuori da localhost e JOB_STALE_AFTER_MS vicina al passo", () => {
    const development = { NODE_ENV: "development" };

    expect(errorMessageOf(() => parseEnv({ ...development, CRON_SECRET: "corta" }))).toContain("CRON_SECRET");
    expect(errorMessageOf(() => parseEnv({ ...development, APP_PUBLIC_URL: "http://app.example.com" }))).toContain(
      "APP_PUBLIC_URL"
    );
    expect(() => parseEnv({ ...development, APP_PUBLIC_URL: "http://localhost:3000" })).not.toThrow();
    expect(errorMessageOf(() => parseEnv({ ...development, JOB_STEP_BUDGET_MS: "200000" }))).toContain(
      "JOB_STALE_AFTER_MS deve superare JOB_STEP_BUDGET_MS"
    );
  });
});

describe("DSN di Sentry (T-601)", () => {
  it("accetta un DSN https o l'assenza e rifiuta un valore non conforme nominando la variabile, mai il valore", () => {
    expect(() => parseEnv({ NODE_ENV: "development", SENTRY_DSN: "https://chiave@o1.ingest.sentry.io/2" })).not.toThrow();
    expect(() => parseEnv({ NODE_ENV: "development", SENTRY_DSN: "" })).not.toThrow();

    const message = errorMessageOf(() => parseEnv({ NODE_ENV: "development", NEXT_PUBLIC_SENTRY_DSN: "http://valore-errato" }));
    expect(message).toMatch(/NEXT_PUBLIC_SENTRY_DSN/);
    expect(message).not.toContain("valore-errato");
  });
});

describe("envInt", () => {
  // covers: AC-201-3
  it("default per il vuoto, errore per il non intero, valore riportato nell'intervallo", () => {
    vi.stubEnv("AUTOCOMPLETE_CONCURRENCY", "");
    expect(envInt("AUTOCOMPLETE_CONCURRENCY", 6, 1, 20)).toBe(6);

    for (const invalid of ["abc", "6x", "1.5"]) {
      vi.stubEnv("AUTOCOMPLETE_CONCURRENCY", invalid);
      expect(() => envInt("AUTOCOMPLETE_CONCURRENCY", 6, 1, 20)).toThrow(/AUTOCOMPLETE_CONCURRENCY/);
    }

    vi.stubEnv("AUTOCOMPLETE_CONCURRENCY", "999");
    expect(envInt("AUTOCOMPLETE_CONCURRENCY", 6, 1, 20)).toBe(20);
  });

  // covers: AC-201-3
  it("nessuna lettura numerica diretta di process.env in lib/", () => {
    const occurrences = listFiles("lib").flatMap((file) =>
      readFileSync(file, "utf8").includes("Number(process.env.") ? [file] : []
    );

    expect(occurrences).toEqual([]);
  });
});
