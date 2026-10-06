// Gate di T-1003 (AC-1003-4): dopo un export riuscito senza completamento dell'onboarding i pulsanti tornano attivi.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingReviewExportStep } from "@/components/onboarding-review-export-step";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // jsdom non implementa gli object URL usati per scaricare il file.
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:export"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingReviewExportStep", () => {
  // covers: AC-1003-4
  it("export 200 con onboarding ancora IN_PROGRESS: i pulsanti di export non restano disabilitati", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input).startsWith("/api/onboarding/state")) {
        return jsonResponse(200, { data: { status: "IN_PROGRESS" } });
      }
      return new Response("keyword\r\n", {
        status: 200,
        headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="export.csv"' },
      });
    });
    render(
      <OnboardingReviewExportStep
        projectId="p1"
        subprojectId="s1"
        projectName="Blog"
        subprojectName="Generale"
        projectKeywordCount={1}
        sectionKeywordCount={1}
        googleSheetsConnected={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Esporta CSV (non escluse)" }));

    expect(await screen.findByText(/Export completato/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Esporta CSV (non escluse)" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "Esporta XLSX (vista corrente)" })).not.toHaveAttribute("disabled");
    expect(screen.getByRole("button", { name: "Esporta JSON (review)" })).not.toHaveAttribute("disabled");
    expect(screen.queryByText("Export CSV...")).toBeNull();
  });
});
