// Gate di T-7102 (AC-7102-1…3): card «Claude Code» delle impostazioni dell'amministrazione con la durata scelta, la
// chiave e il comando claude mcp add mostrati una volta, lo stato della chiave attiva senza la chiave e la revoca.
// impacted-by: T-7302 (la card riceve la spesa di oggi e il tetto giornaliero di spesa di Claude Code)
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAgentKeyCard } from "@/components/admin-agent-key-card";
import { renderWithIntl } from "./intl";

const fetchMock = vi.fn<typeof fetch>();
const ORIGIN = "https://titanseo.example";
const KEY = "tsk_AbCdEfGh0123456789abcdefghijklmnopqrstuvwxyzA";

const SPEND = { spentTodayUsd: 0.4, capUsd: 2 };

const activeStatus = {
  prefix: "AbCdEfGh",
  createdAt: "2026-11-17T10:00:00.000Z",
  expiresAt: "2026-12-17T10:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  active: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("card «Claude Code» dell'amministrazione", () => {
  // covers: AC-7102-1
  it("senza chiave attiva crea una chiave da 60 giorni e mostra la chiave e il comando claude mcp add con «Copia»", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { key: KEY, status: { ...activeStatus, expiresAt: "2027-01-16T10:00:00.000Z" } } }, { status: 201 }));
    renderWithIntl(<AdminAgentKeyCard initial={null} origin={ORIGIN} spend={SPEND} />);

    expect(screen.getByText("Nessuna chiave attiva")).toBeVisible();
    const select = screen.getByLabelText("Durata della chiave");
    expect(select).toHaveValue("90");
    fireEvent.change(select, { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea la chiave" }));

    await waitFor(() => expect(screen.getByLabelText("La tua chiave")).toHaveValue(KEY));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/agent-key");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ duration: 60 });
    expect(screen.getByLabelText("Comando per collegare Claude Code")).toHaveValue(
      `claude mcp add --transport http titanseo https://titanseo.example/api/mcp --header "Authorization: Bearer ${KEY}"`
    );
    expect(screen.getByRole("button", { name: "Copia la chiave" })).toHaveTextContent("Copia");
    expect(screen.getByRole("button", { name: "Copia il comando" })).toHaveTextContent("Copia");
    expect(screen.getByText("Copiali adesso: la chiave e il comando non si vedranno più.")).toBeVisible();
  });

  it("«Copia» scrive il comando negli appunti e mostra «Copiato»", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    fetchMock.mockResolvedValue(Response.json({ data: { key: KEY, status: activeStatus } }, { status: 201 }));
    renderWithIntl(<AdminAgentKeyCard initial={null} origin={ORIGIN} spend={SPEND} />);

    fireEvent.click(screen.getByRole("button", { name: "Crea la chiave" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copia il comando" }));

    await waitFor(() => expect(screen.getByText("Copiato")).toBeVisible());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`Bearer ${KEY}`));
  });

  // covers: AC-7102-2
  it("con una chiave attiva mostra prefisso, scadenza e «Mai usata» senza la chiave; «Crea una chiave nuova» apre l'avviso", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { key: KEY, status: { ...activeStatus, prefix: "ZyXwVuTs" } } }, { status: 201 }));
    renderWithIntl(<AdminAgentKeyCard initial={activeStatus} origin={ORIGIN} spend={SPEND} />);

    const status = screen.getByTestId("agent-key-status");
    expect(within(status).getByText("Chiave: tsk_AbCdEfGh…")).toBeVisible();
    expect(within(status).getByText("Scade il 17/12/26, 11:00")).toBeVisible();
    expect(within(status).getByText("Mai usata")).toBeVisible();
    expect(screen.queryByText("Nessuna chiave attiva")).toBeNull();
    expect(screen.queryByLabelText("La tua chiave")).toBeNull();
    expect(document.body.textContent).not.toContain(KEY);

    fireEvent.click(screen.getByRole("button", { name: "Crea una chiave nuova" }));

    const dialog = screen.getByRole("dialog", { name: "Creare una chiave nuova?" });
    expect(within(dialog).getByText(/La chiave attiva \(tsk_AbCdEfGh…\) smette subito di funzionare/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Crea la chiave nuova" }));

    await waitFor(() => expect(screen.getByLabelText("La tua chiave")).toHaveValue(KEY));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ duration: 90 });
  });

  // covers: AC-7102-3
  it("«Revoca» con la conferma invia la DELETE e la card mostra «Nessuna chiave attiva»", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { ...activeStatus, revokedAt: "2026-11-18T09:00:00.000Z", active: false } }));
    renderWithIntl(<AdminAgentKeyCard initial={activeStatus} origin={ORIGIN} spend={SPEND} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoca" }));
    const dialog = screen.getByRole("dialog", { name: "Revocare la chiave?" });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoca la chiave" }));

    await waitFor(() => expect(screen.getByText("Nessuna chiave attiva")).toBeVisible());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/agent-key");
    expect(init?.method).toBe("DELETE");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("agent-key-status")).toBeNull();
    expect(screen.getByRole("button", { name: "Crea la chiave" })).toBeVisible();
  });

  it("il tetto giornaliero mostra la spesa di oggi e si salva con la PATCH delle impostazioni", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { spentTodayUsd: 0.4, capUsd: 5.5 } }));
    renderWithIntl(<AdminAgentKeyCard initial={activeStatus} origin={ORIGIN} spend={SPEND} />);

    const cap = screen.getByLabelText("Tetto giornaliero di spesa (dollari)");
    expect(cap).toHaveValue(2);
    expect(screen.getByText(/Speso oggi dai lavori di Claude Code: 0,40\s.+ su 2,00\s/)).toBeVisible();
    fireEvent.change(cap, { target: { value: "5.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva il tetto" }));

    await waitFor(() => expect(screen.getByText("Tetto salvato.")).toBeVisible());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/agent-key/settings");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ dailyCapUsd: 5.5 });
    expect(cap).toHaveValue(5.5);
    expect(screen.getByText(/su 5,50\s/)).toBeVisible();
  });

  it("un errore della revoca resta nel dialogo con il testo del catalogo", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: "FORBIDDEN", error: "no" }, { status: 403 }));
    renderWithIntl(<AdminAgentKeyCard initial={activeStatus} origin={ORIGIN} spend={SPEND} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoca" }));
    const dialog = screen.getByRole("dialog", { name: "Revocare la chiave?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoca la chiave" }));

    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeVisible());
    expect(screen.getByTestId("agent-key-status")).toBeVisible();
  });
});
