// Blocco «WordPress» delle impostazioni del progetto (T-4601): la PUT con i tre campi svuota poi la password, la prova
// mostra l'utente WordPress e avvisa se non può scrivere articoli, la guida spiega come creare la password.
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWordPress } from "@/components/project-wordpress";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  return () => vi.unstubAllGlobals();
});

describe("blocco WordPress delle impostazioni", () => {
  it("salva indirizzo, utente e password con la PUT e poi svuota il campo della password", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { siteUrl: "https://blog.esempio.it", username: "redazione", configured: true } }));
    renderWithIntl(<ProjectWordPress projectId="P" initial={{ siteUrl: "", username: "", configured: false }} />);

    expect(screen.queryByRole("button", { name: "Prova collegamento" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Indirizzo del sito WordPress"), { target: { value: "https://blog.esempio.it" } });
    fireEvent.change(screen.getByLabelText("Utente WordPress"), { target: { value: "redazione" } });
    fireEvent.change(screen.getByLabelText("Password per le applicazioni"), { target: { value: "aBcD 1234 eFgH 5678 iJkL 9012" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salva il collegamento" }));
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/projects/P/wordpress");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ siteUrl: "https://blog.esempio.it", username: "redazione", appPassword: "aBcD 1234 eFgH 5678 iJkL 9012" });
    expect((screen.getByLabelText("Password per le applicazioni") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Collegamento salvato.")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByText("Come creare la password per le applicazioni")).toBeTruthy();
  });

  it("«Prova collegamento» mostra l'utente e avvisa se non può scrivere articoli; un errore ha il testo del catalogo", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { name: "Lettore", canEditPosts: false } }));
    fetchMock.mockResolvedValueOnce(Response.json({ error: "WordPress", code: "WP_UNREACHABLE" }, { status: 502 }));
    renderWithIntl(<ProjectWordPress projectId="P" initial={{ siteUrl: "https://blog.esempio.it", username: "redazione", configured: true }} />);

    expect(screen.getByText("Salvata e cifrata: per cambiare indirizzo o utente scrivila di nuovo.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Prova collegamento" }));
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/projects/P/wordpress/test");
    expect(screen.getByText("Collegato come Lettore.")).toBeTruthy();
    expect(screen.getByText("Questo utente non può scrivere articoli: usa un utente Autore, Editore o Amministratore.")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Prova collegamento" }));
    });
    expect(screen.queryByText("Collegato come Lettore.")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Il sito WordPress non è raggiungibile: controlla l'indirizzo e riprova tra poco.");
  });
});
