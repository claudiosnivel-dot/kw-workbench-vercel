import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

// Browser (T-601): senza NEXT_PUBLIC_SENTRY_DSN nessuna init e nessuna richiesta di rete. Niente
// onRouterTransitionStart: serve solo al tracing delle navigazioni, spento (D-13).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init(sentryInitOptions(dsn));
}
