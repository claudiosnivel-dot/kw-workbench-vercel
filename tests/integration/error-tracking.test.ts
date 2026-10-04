// Gate di T-601 (AC-601-1…AC-601-3): Sentry attivo solo con il DSN e nessun dato personale negli eventi.
import type * as SentryModule from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrubEvent } from "@/lib/observability/sentry-scrub";

type SentryOptions = NonNullable<Parameters<typeof SentryModule.init>[0]>;
type Envelope = Parameters<ReturnType<NonNullable<SentryOptions["transport"]>>["send"]>[0];

const TEST_DSN = "https://publickey@o1.ingest.sentry.io/1";
// Valori di AC-601-3 come costanti, lontane dalle righe del test che finiscono negli stack: Sentry
// (ContextLines) allega all'evento le righe di sorgente intorno a ogni frame.
const SESSION_TOKEN = "tok-xyz";
const BEARER_SECRET = "secret-abc";

const { envelopes, initSpy } = vi.hoisted(() => ({ envelopes: [] as Envelope[], initSpy: vi.fn() }));

// Sentry.init sotto spy; il transport reale è sostituito da uno che registra gli envelope in memoria.
vi.mock("@sentry/nextjs", async (importOriginal) => {
  const actual = await importOriginal<typeof SentryModule>();
  return {
    ...actual,
    flush: (timeout?: number) => actual.flush(timeout),
    init: (options: SentryOptions) => {
      initSpy(options);
      return actual.init({
        ...options,
        transport: () => ({
          send: async (envelope: Envelope) => {
            envelopes.push(envelope);
            return {};
          },
          flush: async () => true,
        }),
      });
    },
  };
});

async function loadInstrumentation() {
  vi.resetModules();
  return import("@/instrumentation");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  initSpy.mockClear();
  envelopes.length = 0;
});

describe("register senza DSN", () => {
  // covers: AC-601-1
  it("non chiama Sentry.init e non fa richieste di rete", async () => {
    vi.stubEnv("SENTRY_DSN", undefined);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { register } = await loadInstrumentation();
    await register();

    expect(initSpy).toHaveBeenCalledTimes(0);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });
});

describe("scrubEvent", () => {
  // covers: AC-601-2
  it("toglie cookie e authorization, filtra password e refresh_token e riduce user al solo id", () => {
    const event = {
      request: {
        cookies: { kwb_session: "abc" },
        headers: { authorization: "Bearer x", "user-agent": "vitest" },
        data: { username: "u", password: "segreto-123", nested: { refresh_token: "t-999" } },
      },
      user: { id: "1", username: "u", ip_address: "1.2.3.4" },
    };

    const scrubbed = scrubEvent(event);
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed.request).not.toHaveProperty("cookies");
    expect(scrubbed.request?.headers).not.toHaveProperty("authorization");
    expect(scrubbed.request?.data).toEqual({ username: "u", password: "[Filtered]", nested: { refresh_token: "[Filtered]" } });
    expect(Object.keys(scrubbed.user ?? {})).toEqual(["id"]);
    for (const secret of ["abc", "Bearer x", "segreto-123", "t-999", "1.2.3.4"]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("onRequestError con DSN", () => {
  // covers: AC-601-3
  it("registra un solo envelope con un evento senza cookie di sessione né token", async () => {
    vi.stubEnv("SENTRY_DSN", TEST_DSN);
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    const { register, onRequestError } = await loadInstrumentation();
    await register();
    expect(initSpy).toHaveBeenCalledTimes(1);

    onRequestError(
      new Error("errore durante la richiesta"),
      {
        path: "/api/projects",
        method: "GET",
        headers: { cookie: `kwb_session=${SESSION_TOKEN}`, authorization: `Bearer ${BEARER_SECRET}` },
      },
      { routerKind: "App Router", routePath: "/api/projects", routeType: "route" }
    );
    const Sentry = await import("@sentry/nextjs");
    await Sentry.flush(2000);

    expect(envelopes).toHaveLength(1);
    const [, items] = envelopes[0];
    expect(items.map(([header]) => header.type)).toEqual(["event"]);
    const content = JSON.stringify(envelopes[0]);
    expect(content).not.toContain(SESSION_TOKEN);
    expect(content).not.toContain(BEARER_SECRET);
  });
});
