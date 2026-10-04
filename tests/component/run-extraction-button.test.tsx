// Gate di T-305 (AC-305-3, AC-305-4): l'estrazione è riuscita solo con response.ok e data.status completed.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingRunStep } from "@/components/onboarding-run-step";
import { RunExtractionButton } from "@/components/run-extraction-button";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderOnboardingRunStep() {
  render(<OnboardingRunStep projectId="p1" subprojectId="s1" projectName="Progetto" subprojectName="Sezione" />);
}

describe("OnboardingRunStep", () => {
  // covers: AC-305-3
  it("con risposta 500 JOB_FAILED mostra l'errore e non avanza l'onboarding", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "Estrazione non riuscita", code: "JOB_FAILED" }));
    renderOnboardingRunStep();

    fireEvent.click(screen.getByRole("button", { name: "Avvia prima estrazione" }));

    expect(await screen.findByText("Estrazione non riuscita")).toBeVisible();
    expect(screen.queryByText(/Estrazione completata/)).toBeNull();
    expect(calledUrls()).not.toContain("/api/onboarding/state");
  });

  it("con risposta 200 e job failed mostra il fallback e non chiama /api/onboarding/state", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { status: "failed" } }));
    renderOnboardingRunStep();

    fireEvent.click(screen.getByRole("button", { name: "Avvia prima estrazione" }));

    expect(await screen.findByText("Estrazione non riuscita")).toBeVisible();
    expect(screen.queryByText(/Estrazione completata/)).toBeNull();
    expect(calledUrls()).not.toContain("/api/onboarding/state");
  });
});

describe("RunExtractionButton", () => {
  // covers: AC-305-4
  it("con risposta 200 e data.status failed mostra l'errore e non aggiorna la pagina", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { status: "failed" } }));
    render(<RunExtractionButton projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: "Avvia estrazione" }));

    expect(await screen.findByText("Estrazione non riuscita")).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
