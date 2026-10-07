// Gate di T-1002 (AC-1002-1…3): «Ricomincia» riparte davvero da zero, i passi precedenti si rendono senza
// rimbalzi (regola unica resolveStepAccess) e «Vai alla dashboard» mette in pausa invece di tornare all'onboarding.
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chooseOnboarding } from "@/app/api/onboarding/choice/route";
import { POST as skipOnboarding } from "@/app/api/onboarding/skip/route";
import { GET as getOnboardingState } from "@/app/api/onboarding/state/route";
import type { OnboardingEntryMode, OnboardingStatus, OnboardingStep } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const auth = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => auth.user }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

async function createOnboardingUser(
  username: string,
  progress: { status: OnboardingStatus; current_step: OnboardingStep; entry_mode: OnboardingEntryMode }
) {
  const session = await createUserWithSession({ displayName: username });
  const project = await prisma.project.create({ data: { name: "Blog", workspace_id: await personalWorkspaceId(session.user.id) } });
  await prisma.userOnboardingProgress.create({
    data: { user_id: session.user.id, ...progress, active_project_id: project.id },
  });
  auth.user = { id: session.user.id, displayName: session.user.display_name, role: session.user.role, isRootAdmin: false };
  return { ...session, projectId: project.id };
}

async function renderPage(path: "project-create" | "section-create" | "seeds"): Promise<string> {
  const pages = {
    "project-create": () => import("@/app/onboarding/project-create/page"),
    "section-create": () => import("@/app/onboarding/section-create/page"),
    seeds: () => import("@/app/onboarding/seeds/page"),
  };
  const { default: Page } = await pages[path]();
  return renderToStaticMarkup(await Page());
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("Ricomincia", () => {
  // covers: AC-1002-1
  it("dopo restart il progetto esistente non viene riadottato", async () => {
    const { user, cookie } = await createOnboardingUser("t1002-restart", {
      status: "PAUSED",
      current_step: "SEEDS",
      entry_mode: "RESUME",
    });

    const choice = await callRoute(chooseOnboarding, {
      method: "POST",
      url: "/api/onboarding/choice",
      cookie,
      body: { mode: "restart" },
    });
    const state = await callRoute(getOnboardingState, { url: "/api/onboarding/state", cookie });
    const body = await state.json();

    expect(choice.status).toBe(200);
    expect(state.status).toBe(200);
    expect(body.data.activeProjectId).toBeNull();
    expect(body.data.recommendedStep).toBe("PROJECT_CREATE");
    const progress = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(progress.active_project_id).toBeNull();
  });
});

describe("navigazione indietro", () => {
  // covers: AC-1002-2
  it("/onboarding/project-create in RESUME al passo SECTION_CREATE si rende con 'Continua' senza redirect", async () => {
    const { user } = await createOnboardingUser("t1002-back", {
      status: "IN_PROGRESS",
      current_step: "SECTION_CREATE",
      entry_mode: "RESUME",
    });

    const html = await renderPage("project-create");

    expect(html).toContain("Blog");
    expect(html).toContain("Continua");
    expect(html).toContain('href="/onboarding/section-create"');
    expect(await prisma.project.count({ where: { workspace_id: await personalWorkspaceId(user.id) } })).toBe(1);
  });

  it("/onboarding/section-create con la sezione attiva già creata mostra la sezione e 'Continua'", async () => {
    const { user, projectId } = await createOnboardingUser("t1002-section", {
      status: "IN_PROGRESS",
      current_step: "SEEDS",
      entry_mode: "RESUME",
    });
    const section = await prisma.subproject.create({ data: { project_id: projectId, name: "Generale", position: 0 } });
    await prisma.userOnboardingProgress.update({
      where: { user_id: user.id },
      data: { active_subproject_id: section.id },
    });

    const html = await renderPage("section-create");

    expect(html).toContain("Generale");
    expect(html).toContain("Continua");
    expect(html).not.toContain('id="onboarding-section-name"');
    expect(await prisma.subproject.count({ where: { project_id: projectId } })).toBe(1);
  });

  it("un passo oltre il passo consigliato reindirizza al passo consigliato", async () => {
    await createOnboardingUser("t1002-ahead", { status: "IN_PROGRESS", current_step: "SEEDS", entry_mode: "RESUME" });

    await expect(renderPage("seeds")).rejects.toThrow("redirect /onboarding/section-create");
  });
});

describe("Vai alla dashboard", () => {
  // covers: AC-1002-3
  it("mette in pausa l'onboarding e la dashboard si rende con il banner", async () => {
    const { user, cookie } = await createOnboardingUser("t1002-dashboard", {
      status: "IN_PROGRESS",
      current_step: "REVIEW_EXPORT",
      entry_mode: "RESUME",
    });

    const skip = await callRoute(skipOnboarding, { method: "POST", url: "/api/onboarding/skip", cookie });
    const { default: DashboardPage } = await import("@/app/page");
    const html = renderToStaticMarkup(await DashboardPage({ searchParams: Promise.resolve({}) }));

    expect(skip.status).toBe(200);
    const progress = await prisma.userOnboardingProgress.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(progress.status).toBe("PAUSED");
    expect(html).toContain("Onboarding in pausa");
  });
});
