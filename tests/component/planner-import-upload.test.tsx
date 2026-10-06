// Esito dell'import dei volumi (T-910): il messaggio riporta anche le righe senza volume e quelle scartate dal parser,
// così un file letto male non passa per un file senza corrispondenze (file reale di Keyword Planner, 2026-10-06).
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerImportUpload } from "@/components/planner-import-upload";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlannerImportUpload", () => {
  it("mostra righe abbinate, senza volume e scartate dopo l'import", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { matched: 0, unmatched: 0, updated: 0, rangeRows: 0, withoutVolume: 97, skippedRows: 120 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    render(<PlannerImportUpload projectId="p1" subprojectId="s1" />);

    fireEvent.change(screen.getByLabelText(/File scaricato da Keyword Planner/), {
      target: { files: [new File(["Keyword\n"], "keyword-stats.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Importa volumi" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("97 righe senza volume");
    expect(status).toHaveTextContent("120 righe scartate perché senza keyword o con valori non leggibili");
  });
});
