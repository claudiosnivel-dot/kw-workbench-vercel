// Gate di T-1105 (AC-1105-1…4): utente risolto una volta per richiesta, branding da cache con tag, nessun
// bootstrap nel login con utenti presenti, totali della dashboard admin senza count separati. Le query si
// contano con l'evento query di Prisma (tests/helpers/query-counter).
import { randomBytes } from "node:crypto";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listAdminUsersRoute } from "@/app/api/admin/users/route";
import { POST as login } from "@/app/api/auth/login/route";
import { PATCH as patchBranding } from "@/app/api/settings/branding/route";
import { resetEnvForTests } from "@/lib/env";
import { UserRole, UserStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, TEST_USER_PASSWORD } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import type { QueryCounter } from "../helpers/query-counter";

const shared = vi.hoisted(() => ({
  counter: null as QueryCounter | null,
  sessionToken: null as string | null,
  pathname: "/",
  // Memoria di cache() di React per la richiesta corrente: una mappa per funzione, azzerata a ogni richiesta.
  requestMemo: new Map<unknown, Map<string, unknown>>(),
}));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/prisma")>();
  const { createQueryCounter } = await import("../helpers/query-counter");
  shared.counter = createQueryCounter(original.buildPoolConfig());
  return { ...original, prisma: shared.counter.client };
});

// cache() di React memorizza solo dentro una richiesta dei Server Components (fuori, la versione reale non
// memorizza nulla): qui la richiesta è simulata da requestMemo, azzerata da newRequest().
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  function cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      let byArgs = shared.requestMemo.get(fn);
      if (!byArgs) {
        byArgs = new Map();
        shared.requestMemo.set(fn, byArgs);
      }
      const key = JSON.stringify(args);
      if (!byArgs.has(key)) byArgs.set(key, fn(...args));
      return byArgs.get(key) as R;
    };
  }
  return { ...original, cache };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kwb_session" && shared.sessionToken ? { name, value: shared.sessionToken } : undefined),
  }),
}));
vi.mock("next/font/google", () => ({
  Manrope: () => ({ variable: "font-manrope" }),
  Sora: () => ({ variable: "font-sora" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => shared.pathname,
}));

function counter(): QueryCounter {
  if (!shared.counter) {
    throw new Error("client Prisma con il contatore non installato");
  }
  return shared.counter;
}

/** Nuova richiesta: memoria di cache() vuota e contatore azzerato. */
function newRequest(): void {
  shared.requestMemo.clear();
  counter().reset();
}

function signedInWith(cookie: string | null): void {
  shared.sessionToken = cookie ? cookie.slice(cookie.indexOf("=") + 1) : null;
}

/** Layout e pagina della stessa richiesta, resi in parallelo come fa Next. */
async function renderRequest(page: () => Promise<ReactNode>): Promise<string> {
  const { default: RootLayout } = await import("@/app/layout");
  const [layout, content] = await Promise.all([RootLayout({ children: null }), page()]);
  return renderToStaticMarkup(layout) + renderToStaticMarkup(content);
}

async function renderLogin(): Promise<string> {
  shared.pathname = "/login";
  const { default: LoginPage } = await import("@/app/login/page");
  return renderRequest(() => LoginPage({ searchParams: Promise.resolve({}) }));
}

// Chiave di cifratura generata a ogni esecuzione per le righe di app_settings scritte dal test.
const TEST_ENCRYPTION_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  resetEnvForTests();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  resetEnvForTests();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  signedInWith(null);
  shared.pathname = "/";
  newRequest();
});

describe("query per richiesta (T-1105)", () => {
  // covers: AC-1105-1
  it("layout e DashboardPage della stessa richiesta leggono users una sola volta", async () => {
    const { cookie, user } = await createUserWithSession({ displayName: "dashboard-user" });
    await prisma.userOnboardingProgress.create({ data: { user_id: user.id, status: "COMPLETED", current_step: "REVIEW_EXPORT" } });
    signedInWith(cookie);
    newRequest();

    const { default: DashboardPage } = await import("@/app/page");
    const markup = await renderRequest(() => DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("Panoramica");
    expect(counter().count("users", "SELECT")).toBe(1);
  });

  // covers: AC-1105-2
  it("il branding arriva dalla cache finché il root admin non lo salva", async () => {
    const root = await createUserWithSession({ displayName: "root-branding", role: UserRole.ADMIN, isRootAdmin: true });

    newRequest();
    await renderLogin();
    newRequest();
    const second = await renderLogin();
    expect(counter().count("app_settings", "SELECT")).toBe(0);
    // Il nome dell'app è l'aria-label del link al marchio nella barra in alto.
    expect(second).not.toContain('aria-label="Nuovo"');

    const saved = await callRoute(patchBranding, {
      method: "PATCH",
      url: "/api/settings/branding",
      body: { appName: "Nuovo" },
      cookie: root.cookie,
    });
    expect(saved.status).toBe(200);

    newRequest();
    const third = await renderLogin();
    expect(third).toContain('aria-label="Nuovo"');
  });

  // covers: AC-1105-3
  it("il login con utenti già presenti non esegue il bootstrap del primo utente", async () => {
    await createUserWithSession({ displayName: "root-login", role: UserRole.ADMIN, isRootAdmin: true });
    await createUserWithSession({ displayName: "login-user" });
    newRequest();

    const response = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      // impacted-by: T-1401 (accesso con l'email)
      body: { email: "login-user@example.test", password: TEST_USER_PASSWORD },
    });

    expect(response.status).toBe(200);
    const bootstrapReads = counter()
      .statements("users", "SELECT")
      .filter((statement) => /ORDER BY[^;]*"created_at"/i.test(statement.query));
    expect(bootstrapReads).toEqual([]);
    expect(counter().count("app_settings", "SELECT")).toBe(0);
  });

  // covers: AC-1105-4
  it("GET /api/admin/users con 50 utenti misti usa al massimo 2 query su users e totali esatti", async () => {
    const root = await createUserWithSession({ displayName: "root-admin-list", role: UserRole.ADMIN, isRootAdmin: true });
    // Oltre al root admin (ADMIN, ACTIVE): 9 admin (6 attivi, 3 sospesi) e 40 sottoscrittori (32 attivi, 8 sospesi).
    const others = [
      ...Array.from({ length: 9 }, (_, index) => ({ role: UserRole.ADMIN, status: index < 6 ? UserStatus.ACTIVE : UserStatus.SUSPENDED })),
      ...Array.from({ length: 40 }, (_, index) => ({
        role: UserRole.SUBSCRIBER,
        status: index < 32 ? UserStatus.ACTIVE : UserStatus.SUSPENDED,
      })),
    ];
    await prisma.user.createMany({
      data: others.map((other, index) => ({ display_name: `misto-${index}`, password_hash: "x", ...other })),
    });
    newRequest();

    const response = await callRoute(listAdminUsersRoute, { url: "/api/admin/users", cookie: root.cookie });

    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { users: unknown[]; total: number; totals: Record<string, number | null> };
    };
    const usersQueries = (["SELECT", "INSERT", "UPDATE", "DELETE"] as const).reduce(
      (sum, kind) => sum + counter().count("users", kind),
      0
    );
    expect(usersQueries).toBeLessThanOrEqual(2);
    expect(data.totals).toEqual({ totalUsers: 50, totalAdmins: 10, totalSubscribers: 40, totalActive: 39, totalSuspended: 11 });
    expect(data.total).toBe(50);
    expect(data.users).toHaveLength(50);
  });
});
