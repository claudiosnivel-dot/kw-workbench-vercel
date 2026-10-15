// Gate di T-2902 (AC-2902-1…3): il collegamento personale a Google Sheets in tre stati detti con parole semplici (non
// collegato, collegato come…, da ricollegare), senza scope né tipo di token.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleSheetsPersonalCard } from "@/components/google-sheets-personal-card";
import { renderWithIntl } from "./intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const CONNECT_URL = "/api/integrations/google-sheets/connect";
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

describe("GoogleSheetsPersonalCard", () => {
  // covers: AC-2902-1
  it("collegato con drive.file mostra l'email e Scollega, senza scope", () => {
    const { container } = renderWithIntl(
      <GoogleSheetsPersonalCard
        initial={{
          connected: true,
          status: "connected",
          needsReconnect: false,
          connectedEmail: "mario@gmail.com",
          scope: DRIVE_FILE_SCOPE,
          tokenType: "Bearer",
        }}
      />
    );

    expect(screen.getByText("Collegato come mario@gmail.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Scollega" })).toBeVisible();
    expect(container.innerHTML).not.toContain("drive.file");
    expect(container.textContent).not.toContain("Scope:");
  });

  // covers: AC-2902-2
  it("collegato con needsReconnect mostra Da ricollegare e un solo Ricollega verso il collegamento", () => {
    renderWithIntl(
      <GoogleSheetsPersonalCard
        initial={{
          connected: true,
          status: "connected",
          needsReconnect: true,
          connectedEmail: "mario@gmail.com",
          scope: "https://www.googleapis.com/auth/spreadsheets",
        }}
      />
    );

    expect(screen.getByText("Da ricollegare")).toBeVisible();
    const reconnect = screen.getAllByRole("link", { name: "Ricollega" });
    expect(reconnect).toHaveLength(1);
    expect(reconnect[0]).toHaveAttribute("href", CONNECT_URL);
  });

  // covers: AC-2902-3
  it("non collegato mostra un solo Collega Google Sheets e nessun Scollega", () => {
    renderWithIntl(
      <GoogleSheetsPersonalCard initial={{ connected: false, status: "disconnected", needsReconnect: false }} />
    );

    const connect = screen.getAllByRole("link", { name: "Collega Google Sheets" });
    expect(connect).toHaveLength(1);
    expect(connect[0]).toHaveAttribute("href", CONNECT_URL);
    expect(screen.queryAllByRole("button", { name: "Scollega" })).toHaveLength(0);
  });
});
