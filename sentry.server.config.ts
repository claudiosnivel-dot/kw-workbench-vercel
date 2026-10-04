import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

// Runtime Node.js (T-601): senza SENTRY_DSN nessuna init e nessuna richiesta di rete.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init(sentryInitOptions(dsn));
}
