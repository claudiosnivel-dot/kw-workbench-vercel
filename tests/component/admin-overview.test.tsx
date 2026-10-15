// Gate di T-3302 (AC-3302-1, AC-3302-2): Panoramica dell'amministrazione con gli indicatori in riquadri e la spesa del
// fornitore di metriche con una barra.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminKpiCard } from "@/components/admin-kpi-card";
import { MetricsSpendCard } from "@/components/metrics-spend-card";
import type { PlatformKpi } from "@/lib/admin/kpi-types";
import { renderWithIntl } from "./intl";

const KPI: PlatformKpi = {
  users: { total: 14, active: 13, suspended: 1 },
  workspaces: { total: 9 },
  subscriptions: { byPlan: {}, byStatus: { active: 0 } as PlatformKpi["subscriptions"]["byStatus"] },
  mrr: {},
  extractionsPerDay: [
    { date: "2026-10-14", count: 30 },
    { date: "2026-10-15", count: 7 },
  ],
  failedJobRate7d: 0.02,
};

describe("Panoramica dell'amministrazione", () => {
  // covers: AC-3302-1
  it("gli indicatori sono 6 riquadri con utenti, workspace, estrazioni e job falliti, senza la sigla MRR", () => {
    const { container } = renderWithIntl(<AdminKpiCard kpi={KPI} />);

    const tiles = screen.getAllByTestId("admin-kpi-tile");
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toHaveTextContent("14");
    expect(tiles[1]).toHaveTextContent("9");
    expect(tiles[2]).toHaveTextContent("37");
    expect(tiles[3]).toHaveTextContent("2%");
    expect(container).not.toHaveTextContent("MRR");
  });

  // covers: AC-3302-2
  it("la spesa del mese ha una barra con la percentuale del tetto spesa", () => {
    renderWithIntl(<MetricsSpendCard spend={{ month: "2026-10", spentUsd: 4.2, budgetUsd: 10, requests: 3, keywords: 120 }} />);

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveAttribute("aria-valuenow", "42");
  });
});
