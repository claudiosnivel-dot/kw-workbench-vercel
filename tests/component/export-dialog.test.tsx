// Gate di T-2406 (AC-2406-2): la finestra Esporta parte impostata in base alla pagina; dalla strategia con un branding
// senza logo propone il piano in PDF senza l'opzione del logo; senza strategie il piano è disattivato.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog, type ExportDialogProps } from "@/components/export-dialog";
import { renderWithIntl } from "./intl";

const BASE: ExportDialogProps = {
  projectId: "P",
  projectName: "Negozio",
  origin: { kind: "plan" },
  topics: [{ id: "T", name: "Scarpe", keptCount: 24, totalCount: 30 }],
  keptCount: 24,
  plan: { strategyId: "S", pageCount: 12 },
  view: null,
  sheetsConnected: true,
  hasLogo: false,
  onClose: vi.fn(),
};

describe("ExportDialog", () => {
  // covers: AC-2406-2
  it("dalla strategia sceglie il piano in PDF senza logo; senza strategie il piano è disattivato con Costruisci prima il piano", () => {
    const { unmount } = renderWithIntl(<ExportDialog {...BASE} />);

    expect(screen.getByRole("radio", { name: /Il piano dei contenuti/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "PDF per il cliente" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Scarica il PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Con il tuo logo in copertina" })).toBeNull();
    unmount();

    renderWithIntl(<ExportDialog {...BASE} origin={{ kind: "project" }} plan={null} />);

    const plan = screen.getByRole("radio", { name: /Il piano dei contenuti/ });
    expect(plan).toBeDisabled();
    expect(plan.closest("label")).toHaveTextContent("Costruisci prima il piano");
    expect(screen.getByRole("radio", { name: /Le keyword/ })).toBeChecked();
  });
});
