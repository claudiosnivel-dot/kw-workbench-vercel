// Gate di T-1004 (AC-1004-1…3): lo stato dell'onboarding si legge senza scritture; la dashboard legge il solo
// status con una query. Le query si contano con l'helper dell'evento query di Prisma (tests/helpers/query-counter).
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getOnboardingState } from "@/app/api/onboarding/state/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import type { QueryCounter } from "../helpers/query-counter";

const shared = vi.hoisted(() => ({ user: null as unknown, counter: null as QueryCounter | null }));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/prisma")>();
  const { createQueryCounter } = await import("../helpers/query-counter");
  shared.counter = createQueryCounter(original.buildPoolConfig());
  return { ...original, prisma: shared.counter.client };
});
vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => shared.user }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const PROGRESS_TABLE = "user_onboarding_progress";

function counter(): QueryCounter {
  if (!shared.counter) {
    throw new Error("client Prisma con il contatore non installato");
  }
  return shared.counter;
}

async function renderDashboard(): Promise<string> {
  const { default: DashboardPage } = await import("@/app/page");
  return renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));
}

async function signIn(username: string) {
  const session = await createUserWithSession({ displayName: username });
  shared.user = { id: session.user.id, displayName: session.user.display_name, role: session.user.role, isRootAdmin: false };
  return session;
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("dashboard", () => {
  // covers: AC-1004-1
  it("con onboarding COMPLETED legge user_onboarding_progress con 1 SELECT e nessuna scrittura", async () => {
    const { user } = await signIn("t1004-completed");
    await prisma.userOnboardingProgress.create({
      data: { user_id: user.id, status: "COMPLETED", current_step: "REVIEW_EXPORT", completed_at: new Date() },
    });
    counter().reset();

    const html = await renderDashboard();

    expect(html).toContain("Progetti");
    expect(counter().count(PROGRESS_TABLE, "SELECT")).toBe(1);
    expect(counter().count(PROGRESS_TABLE, "INSERT")).toBe(0);
    expect(counter().count(PROGRESS_TABLE, "UPDATE")).toBe(0);
  });

  // covers: AC-1004-2
  it("senza riga di progress reindirizza a /onboarding senza crearla", async () => {
    const { user } = await signIn("t1004-no-row");

    await expect(renderDashboard()).rejects.toThrow("redirect /onboarding");

    expect(await prisma.userOnboardingProgress.count({ where: { user_id: user.id } })).toBe(0);
  });
});

describe("GET /api/onboarding/state", () => {
  // covers: AC-1004-3
  it("due letture con progetto attivo: stesso currentStep, updated_at invariato e nessuna scrittura", async () => {
    const { user, cookie } = await signIn("t1004-state");
    const project = await prisma.project.create({ data: { name: "Blog", owner_user_id: user.id } });
    // Sezione non ancora registrata nel progress: la lettura non deve riconciliarla scrivendo (T-1004).
    await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    await prisma.userOnboardingProgress.create({
      data: {
        user_id: user.id,
        status: "IN_PROGRESS",
        current_step: "PROJECT_TARGETING",
        entry_mode: "RESUME",
        active_project_id: project.id,
      },
    });
    const before = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: user.id } });
    counter().reset();

    const first = await callRoute(getOnboardingState, { url: "/api/onboarding/state", cookie });
    const second = await callRoute(getOnboardingState, { url: "/api/onboarding/state", cookie });
    const firstBody = await first.json();
    const secondBody = await second.json();
    const writes = counter().count(PROGRESS_TABLE, "INSERT") + counter().count(PROGRESS_TABLE, "UPDATE");
    const after = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: user.id } });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(firstBody.data.currentStep).toBe("PROJECT_TARGETING");
    expect(secondBody.data.currentStep).toBe(firstBody.data.currentStep);
    expect(after.updated_at.toISOString()).toBe(before.updated_at.toISOString());
    expect(writes).toBe(0);
  });
});
