// Gate di T-1601 (AC-1601-1…4): piani e diritti da un'unica configurazione, con degrado al piano free.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPlansConfigured,
  PLANS,
  PLANS_CONFIG_STATUS,
  resolveEntitlements,
  setPlansForTesting,
  type PlanLimits,
  validatePlans,
} from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/lib/generated/prisma/enums";
import { logger } from "@/lib/observability/logger";

const NOW = new Date("2026-10-08T12:00:00.000Z");

const FREE_LIMITS: PlanLimits = {
  maxProjects: 1,
  maxSectionsPerProject: 2,
  maxSeedsPerSection: 10,
  runsPerDay: 3,
  maxKeywordsPerRun: 500,
  keywordsPerMonth: 2_000,
  licensedMetricsKeywordsPerMonth: 0,
  seats: 1,
  sheetsExport: false,
  plannerImport: false,
  licensedMetrics: false,
};
const PRO_LIMITS: PlanLimits = {
  maxProjects: 20,
  maxSectionsPerProject: 50,
  maxSeedsPerSection: 200,
  runsPerDay: 50,
  maxKeywordsPerRun: 10_000,
  keywordsPerMonth: 200_000,
  licensedMetricsKeywordsPerMonth: 20_000,
  seats: 5,
  sheetsExport: true,
  plannerImport: true,
  licensedMetrics: true,
};

function plan(id: string, limits: Record<string, unknown>) {
  return { id, nameKey: `billing.plans.${id}`, public: true, order: 0, displayPrice: {}, priceEnv: {}, limits };
}

afterEach(() => {
  setPlansForTesting(null);
  vi.restoreAllMocks();
});

describe("resolveEntitlements", () => {
  // covers: AC-1601-1
  it("senza abbonamento restituisce il piano free con i suoi limiti", () => {
    const entitlements = resolveEntitlements(null, NOW);

    expect(entitlements.planId).toBe("free");
    expect(entitlements.limits).toEqual(PLANS.free.limits);
  });

  // covers: AC-1601-2
  it("active e trialing danno i limiti del piano pagato; past_due, paused e canceled quelli di free", () => {
    setPlansForTesting({ free: plan("free", FREE_LIMITS), pro: plan("pro", PRO_LIMITS) });

    const byStatus = (status: SubscriptionStatus) =>
      resolveEntitlements({ planId: "pro", status, pastDueSince: null }, NOW).limits;

    expect(byStatus("active")).toEqual(PRO_LIMITS);
    expect(byStatus("trialing")).toEqual(PRO_LIMITS);
    expect(byStatus("past_due")).toEqual(FREE_LIMITS);
    expect(byStatus("paused")).toEqual(FREE_LIMITS);
    expect(byStatus("canceled")).toEqual(FREE_LIMITS);
  });

  // covers: AC-1601-3
  it("un piano sconosciuto degrada a free con un solo warning che riporta il planId", () => {
    setPlansForTesting({ free: plan("free", FREE_LIMITS), pro: plan("pro", PRO_LIMITS) });
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const entitlements = resolveEntitlements({ planId: "sconosciuto-x", status: "active", pastDueSince: null }, NOW);

    expect(entitlements.limits).toEqual(FREE_LIMITS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("billing_unknown_plan", { planId: "sconosciuto-x" });
  });
});

describe("configurazione dei piani", () => {
  // covers: AC-1601-4
  it("un limite negativo o una chiave mancante sono errori con piano e chiave; i segnaposto non sono configurati", () => {
    const withoutSeats: Record<string, unknown> = { ...PRO_LIMITS };
    delete withoutSeats.seats;

    expect(() => validatePlans({ free: plan("free", { ...FREE_LIMITS, maxProjects: -1 }) })).toThrow(
      /free.*maxProjects/
    );
    expect(() => validatePlans({ free: plan("free", FREE_LIMITS), pro: plan("pro", withoutSeats) })).toThrow(
      /pro.*seats/
    );
    expect(PLANS_CONFIG_STATUS).toBe("placeholder-D14");
    expect(isPlansConfigured()).toBe(false);
  });

  it("senza piano free la configurazione non è valida; i piani di prova contano come configurati", () => {
    expect(() => validatePlans({ pro: plan("pro", PRO_LIMITS) })).toThrow(/free/);

    setPlansForTesting({ free: plan("free", FREE_LIMITS) });
    expect(isPlansConfigured()).toBe(true);
  });
});
