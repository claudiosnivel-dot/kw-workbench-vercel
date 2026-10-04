import * as Sentry from "@sentry/nextjs";
import { getEnv } from "@/lib/env";

// Validazione della configurazione all'avvio (T-201): con variabili errate il server non parte
// e l'errore elenca le variabili da correggere. Poi Sentry per il runtime corrente (T-601): ogni
// config chiama Sentry.init solo se SENTRY_DSN è impostata.
export async function register(): Promise<void> {
  getEnv();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
