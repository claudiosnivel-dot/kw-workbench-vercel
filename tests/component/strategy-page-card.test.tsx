// Gate di T-1905 (AC-1905-4): l'etichetta «suggerito» accompagna l'H1 finché l'utente non lo riscrive.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StrategyPageCard } from "@/components/strategy/strategy-page-card";
import type { StrategyPageView } from "@/lib/modules/strategy/types";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function page(h1Edited: boolean): StrategyPageView {
  return {
    id: h1Edited ? "edited" : "suggested",
    kind: "SPOKE",
    hubPageId: "hub",
    h1: h1Edited ? "Il mio titolo" : "Migliori scarpe running: classifica 2026",
    h2: ["Scarpe running recensioni"],
    h1Edited,
    h2Edited: false,
    contentType: "list",
    priority: 3460,
    position: 1,
    reason: { code: "SPOKE_MODIFIER", params: { category: "comparison", faq: 0 } },
    keywords: [
      { id: "k1", keyword: "migliori scarpe running", canonical: "migliori scarpe running", role: "MAIN", volume: 2900, score: 85, isQuestion: false },
      { id: "k2", keyword: "scarpe running recensioni", canonical: "scarpe running recensioni", role: "SECONDARY", volume: 390, score: 66, isQuestion: false },
    ],
  };
}

function renderCard(h1Edited: boolean) {
  return renderWithIntl(
    <StrategyPageCard
      projectId="p1"
      strategyId="s1"
      version={0}
      page={page(h1Edited)}
      links={["Scarpe running: la guida pratica"]}
      destinations={[{ id: "hub", label: "Scarpe running: la guida pratica" }]}
    />
  );
}

describe("StrategyPageCard", () => {
  // covers: AC-1905-4
  it("mostra «suggerito» accanto all'H1 non modificato e non accanto a quello modificato", () => {
    const { unmount } = renderCard(false);
    const suggested = screen.getByTestId("strategy-page-h1");
    expect(within(suggested).getByRole("heading", { name: "Migliori scarpe running: classifica 2026" })).toBeVisible();
    expect(within(suggested).getByText("suggerito")).toBeVisible();
    unmount();

    renderCard(true);
    const edited = screen.getByTestId("strategy-page-h1");
    expect(within(edited).getByRole("heading", { name: "Il mio titolo" })).toBeVisible();
    expect(within(edited).queryByText("suggerito")).toBeNull();
  });
});
