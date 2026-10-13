// Gate di T-2405 (AC-2405-2): il dialogo «Aggiungi i volumi» ha sempre i tre passi del percorso guidato e l'opzione
// automatica solo per chi può scegliere il fornitore con licenza.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddVolumesDialog } from "@/components/add-volumes-dialog";
import it_ from "@/messages/it.json";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const volumes = it_.keywords.volumes;

function expectGuidedSteps(): void {
  expect(screen.getByText(volumes.step1)).toBeInTheDocument();
  expect(screen.getByText(volumes.step2)).toBeInTheDocument();
  expect(screen.getByText(volumes.step3)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: it_.export.planner.exportButton })).toBeInTheDocument();
  expect(screen.getByLabelText(/File scaricato da Keyword Planner/)).toBeInTheDocument();
}

describe("AddVolumesDialog", () => {
  // covers: AC-2405-2
  it("senza diritto alle metriche con licenza solo il percorso guidato; per il root admin anche l'opzione automatica", () => {
    const { unmount } = renderWithIntl(<AddVolumesDialog projectId="P" topicId="T" canAuto={false} onClose={vi.fn()} />);
    expectGuidedSteps();
    expect(screen.queryByRole("button", { name: volumes.autoButton })).toBeNull();
    unmount();

    renderWithIntl(<AddVolumesDialog projectId="P" topicId="T" canAuto onClose={vi.fn()} />);
    expectGuidedSteps();
    expect(screen.getByRole("button", { name: volumes.autoButton })).toBeInTheDocument();
  });
});
