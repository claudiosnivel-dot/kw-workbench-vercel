// Gate di T-3704 (AC-3704-3, D-45): il riquadro «Aggiungi i volumi» dice perché i volumi non sono arrivati, con i testi
// del catalogo o il solo codice numerico di DataForSEO, mai il messaggio del fornitore.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AddVolumesNotice } from "@/components/add-volumes-dialog";
import it_ from "@/messages/it.json";
import type { VolumesReason } from "@/lib/modules/volumes-reason";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const volumes = it_.keywords.volumes;

/** Testi del riquadro, uno per paragrafo. */
function renderNotice(reason: VolumesReason | null): string[] {
  const { container, unmount } = renderWithIntl(<AddVolumesNotice projectId="P" topicId="T" canAuto={false} reason={reason} />);
  const texts = Array.from(container.querySelectorAll("p"), (paragraph) => paragraph.textContent ?? "");
  unmount();
  return texts;
}

describe("AddVolumesNotice con il motivo", () => {
  // covers: AC-3704-3
  it("codice 40104, codice 40999, RUN_BUDGET_EXCEEDED e nessun motivo", () => {
    expect(renderNotice({ kind: "provider", code: 40104 })).toEqual([volumes.notice, volumes.reason.verifyAccount]);
    expect(volumes.reason.verifyAccount).toMatch(/account DataForSEO va verificato/);
    expect(renderNotice({ kind: "provider", code: 40999 })).toEqual([volumes.notice, "DataForSEO ha risposto con il codice 40999."]);
    expect(renderNotice({ kind: "notice", notice: "RUN_BUDGET_EXCEEDED" })).toEqual([
      volumes.notice,
      volumes.reason.notice.RUN_BUDGET_EXCEEDED,
    ]);
    expect(volumes.reason.notice.RUN_BUDGET_EXCEEDED).toMatch(/tetto di spesa per estrazione/);
    expect(renderNotice(null)).toEqual([volumes.notice]);
  });

  it("40100 ha il testo delle credenziali; senza codice il fornitore non ha risposto; un notice sconosciuto non aggiunge testo", () => {
    expect(renderNotice({ kind: "provider", code: 40100 })).toEqual([volumes.notice, volumes.reason.credentials]);
    expect(renderNotice({ kind: "provider", code: null })).toEqual([volumes.notice, volumes.reason.noResponse]);
    expect(renderNotice({ kind: "notice", notice: "SCONOSCIUTO" })).toEqual([volumes.notice]);
    expect(screen.queryByText(/Please verify/)).toBeNull();
  });
});
