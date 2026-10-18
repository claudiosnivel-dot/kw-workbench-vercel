// Gate di T-3703 (AC-3703-1, AC-3703-2, D-44): a ricerca finita, un argomento con meno di 20 keyword invita a cambiare
// le parole di partenza; durante una ricerca, senza ricerche completate o da 20 keyword in su l'avviso non c'è.
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FewKeywordsNotice } from "@/components/keywords/few-keywords-notice";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const TEXT = "Google ha pochi suggerimenti per queste parole";
const BASE = { projectId: "P", topicId: "T", seeds: ["letto elettronico ospedaliero"] };

describe("FewKeywordsNotice", () => {
  // covers: AC-3703-1
  it("con 3 keyword, nessuna ricerca in corso e una completata mostra l'avviso e apre «Parole di partenza»", () => {
    renderWithIntl(<FewKeywordsNotice {...BASE} keywordCount={3} searching={false} hasCompletedSearch />);

    expect(screen.getByText(new RegExp(TEXT))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cambia le parole di partenza" }));

    const dialog = screen.getByRole("dialog", { name: "Parole di partenza" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("letto elettronico ospedaliero")).toBeInTheDocument();
  });

  // covers: AC-3703-2
  it("con 20 keyword, con una ricerca in corso o senza ricerche completate non c'è l'avviso", () => {
    const cases = [
      { keywordCount: 20, searching: false, hasCompletedSearch: true },
      { keywordCount: 3, searching: true, hasCompletedSearch: true },
      { keywordCount: 0, searching: false, hasCompletedSearch: false },
    ];
    for (const props of cases) {
      const { unmount } = renderWithIntl(<FewKeywordsNotice {...BASE} {...props} />);
      expect(screen.queryByText(new RegExp(TEXT))).toBeNull();
      expect(screen.queryByRole("button", { name: "Cambia le parole di partenza" })).toBeNull();
      unmount();
    }
  });
});
