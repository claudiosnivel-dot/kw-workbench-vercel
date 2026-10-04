import type * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/observability/sentry-scrub";

/**
 * Opzioni di Sentry.init comuni a server, edge e client (T-601, D-13): niente tracing né Session Replay,
 * ogni evento filtrato da scrubEvent. In @sentry/nextjs 11 sendDefaultPii non esiste più: lo sostituisce
 * dataCollection, che per default raccoglie utente, cookie, header, body, query e variabili locali degli
 * stack; qui è tutto spento.
 */
export function sentryInitOptions(dsn: string) {
  return {
    dsn,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  } satisfies Parameters<typeof Sentry.init>[0];
}
