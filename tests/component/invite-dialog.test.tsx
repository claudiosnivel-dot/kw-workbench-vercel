// Gate di T-3201 (AC-3201-4): la finestra «Invita una persona» mostra il link restituito dalla rotta in un campo di sola
// lettura, «Copia» lo mette negli appunti e la frase dell'email compare solo se l'email è partita.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteButton } from "@/components/invite-dialog";
import { renderWithIntl } from "./intl";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/members",
  useRouter: () => router,
}));

const INVITE_URL = "https://app.test/invites/accept?token=abc";
const EXPIRES_AT = "2026-10-22T10:00:00.000Z";
const fetchMock = vi.fn<typeof fetch>();
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  fetchMock.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finestra «Invita una persona»", () => {
  // covers: AC-3201-4
  it("dopo il 201 mostra il link in sola lettura e «Copia» lo scrive negli appunti; senza email nessuna frase dell'email", async () => {
    const body = {
      data: { id: "i1", email: "nuovo@example.com", role: "MEMBER", expiresAt: EXPIRES_AT, inviteUrl: INVITE_URL, emailSent: false },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 201, headers: { "Content-Type": "application/json" } }));
    renderWithIntl(<InviteButton workspaceId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Invita una persona" }));
    const dialog = screen.getByRole("dialog", { name: "Invita una persona" });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nuovo@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea l'invito" }));
    const link = await screen.findByLabelText("Link dell'invito per nuovo@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Copia" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/workspaces/w1/invites");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "nuovo@example.com", role: "MEMBER" });
    expect(link).toHaveValue(INVITE_URL);
    expect(link).toHaveAttribute("readonly");
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(INVITE_URL);
    expect(await screen.findByRole("status")).toHaveTextContent("Link copiato.");
    expect(dialog).toHaveTextContent("Lo vedi solo adesso");
    expect(dialog).not.toHaveTextContent("Gli abbiamo mandato anche un'email");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("con l'email partita la finestra lo dice; un errore della rotta resta nella finestra con il testo del catalogo", async () => {
    const sent = {
      data: { id: "i2", email: "b@example.com", role: "ADMIN", expiresAt: EXPIRES_AT, inviteUrl: INVITE_URL, emailSent: true },
    };
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "INVITE_PENDING" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(sent), { status: 201 }));
    renderWithIntl(<InviteButton workspaceId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "Invita una persona" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "b@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea l'invito" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esiste già un invito in attesa per questa email.");
    fireEvent.click(screen.getByRole("button", { name: "Crea l'invito" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Gli abbiamo mandato anche un'email."));
  });
});
