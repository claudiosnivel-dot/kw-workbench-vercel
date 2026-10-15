// Gate di T-3002 (AC-3002-1, AC-3002-2): «Cambia email» nel Profilo, spento senza invio delle email, e la richiesta
// inviata dalla finestra che lascia «In attesa di conferma» con «Annulla».
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailChangeSection } from "@/components/email-change-section";
import { renderWithIntl } from "./intl";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("email del Profilo", () => {
  // covers: AC-3002-1
  it("senza invio delle email «Cambia email» è spento e la riga rimanda all'amministratore", () => {
    renderWithIntl(<EmailChangeSection email="a@example.com" pending={null} emailDeliveryAvailable={false} />);

    expect(screen.getByRole("button", { name: "Cambia email" })).toHaveAttribute("disabled");
    expect(screen.getByText(/amministratore/)).toBeVisible();
  });

  // covers: AC-3002-2
  it("la finestra invia nuova email e password, si chiude e lascia la richiesta in attesa con Annulla", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { newEmail: "b@example.com", expiresAt: "2026-10-16T12:00:00.000Z" } }, { status: 202 })
    );
    renderWithIntl(<EmailChangeSection email="a@example.com" pending={null} emailDeliveryAvailable />);

    fireEvent.click(screen.getByRole("button", { name: "Cambia email" }));
    fireEvent.change(screen.getByLabelText("Nuova email"), { target: { value: "b@example.com" } });
    fireEvent.change(screen.getByLabelText("Password attuale"), { target: { value: "password-3002-non-reale" } });
    fireEvent.click(screen.getByRole("button", { name: "Manda il link di conferma" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/account/email");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ newEmail: "b@example.com", currentPassword: "password-3002-non-reale" });
    expect(screen.getByText("In attesa di conferma: b@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeVisible();
  });
});
