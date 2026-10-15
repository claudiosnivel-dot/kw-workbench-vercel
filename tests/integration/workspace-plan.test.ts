// Gate di T-3102 (AC-3102-2): con il lancio attivo la sezione Piano del workspace mostra a tutti i membri «Il tuo piano»
// con il nome del piano e le azioni di fatturazione solo a chi ha billing.manage. Il vecchio indirizzo /billing che
// porta alla sezione è in tests/e2e/workspace-sections.spec.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAuthUserById } from "@/lib/auth/credentials";
import { setPlansForTesting } from "@/lib/billing/plans";
import { resetEnvForTests } from "@/lib/env";
import { billingTeam, seedSubscription } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { setRequestCookie } from "../helpers/next-cookies";
import { configureTestBilling } from "../helpers/paddle";
import { fakePaddleApi } from "../helpers/paddle-fake";

const page = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/lib/auth/page-guard", () => ({ requirePageUser: async () => page.user }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/workspace/plan",
}));

const ACTION = 'data-testid="billing-action"';

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  configureTestBilling({});
  await resetDatabase();
  await setCommercialLaunchForTests("live");
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvForTests();
});

/** Sezione Piano resa per l'utente con il workspace attivo dal cookie kwb_workspace. */
async function renderPlanSection(userId: string, workspaceId: string): Promise<string> {
  page.user = await findAuthUserById(userId);
  setRequestCookie("kwb_workspace", workspaceId);
  const { default: WorkspacePlanPage } = await import("@/app/workspace/(sections)/plan/page");
  return renderToStaticMarkup(await WorkspacePlanPage());
}

/** Occorrenze di text in html. */
function count(html: string, text: string): number {
  return html.split(text).length - 1;
}

describe("sezione Piano del workspace", () => {
  // covers: AC-3102-2
  it("OWNER e MEMBER vedono il riepilogo con il nome del piano; solo l'OWNER ha le azioni di fatturazione", async () => {
    const paddle = fakePaddleApi({});
    const { owner, member, workspaceId } = await billingTeam("t3102");
    await seedSubscription(workspaceId, { status: "active", planId: "pro" });

    const byOwner = await renderPlanSection(owner.user.id, workspaceId);
    const byMember = await renderPlanSection(member.user.id, workspaceId);

    for (const html of [byOwner, byMember]) {
      expect(html).toContain('data-testid="billing-summary"');
      expect(html).toContain("Piano: pro");
    }
    expect(count(byMember, ACTION)).toBe(0);
    expect(count(byOwner, ACTION)).toBeGreaterThanOrEqual(1);
    expect(paddle.requests).toHaveLength(0);
  });
});
