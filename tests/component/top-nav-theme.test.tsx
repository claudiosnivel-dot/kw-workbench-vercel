// Gate di T-5702 (AC-5702-2): l'interruttore sole/luna c'è solo nella barra degli anonimi. Con T-5701: con il tema
// SYSTEM il logo è quello del tema del dispositivo, anche quando il dispositivo cambia tema a pagina aperta.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/top-nav";
import { renderWithIntl } from "./intl";

const navigation = vi.hoisted(() => ({ pathname: "/it" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const USER = { displayName: "Utente", email: "utente@example.test" };
const LOGOS = { brandLogoUrlDark: "/logo-dark.png", brandLogoUrlLight: "/logo-light.png" };

/** Dispositivo con il tema chiaro o scuro (jsdom non ha matchMedia); change() lo cambia a pagina aperta. */
function deviceTheme(light: boolean) {
  const listeners = new Set<() => void>();
  let prefersLight = light;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      media,
      get matches() {
        return media.includes("light") ? prefersLight : !prefersLight;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }))
  );
  return {
    change(nextLight: boolean) {
      prefersLight = nextLight;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.cookie = "kwb_theme=; path=/; max-age=0";
  vi.unstubAllGlobals();
});

describe("interruttore del tema nella barra in alto", () => {
  // covers: AC-5702-2
  it("non c'è per l'utente con la sessione; per l'anonimo con data-theme DARK c'è «Passa al tema chiaro»", () => {
    document.documentElement.setAttribute("data-theme", "DARK");
    const { unmount } = renderWithIntl(<TopNav brandName="Titan SEO" themeMode="DARK" user={USER} />);
    expect(screen.queryByRole("button", { name: "Passa al tema chiaro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Passa al tema scuro" })).toBeNull();
    unmount();

    renderWithIntl(<TopNav brandName="Titan SEO" themeMode="DARK" user={null} />);
    expect(screen.getByRole("button", { name: "Passa al tema chiaro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Passa al tema scuro" })).toBeNull();
  });

  it("il clic passa subito all'altro tema e scrive il cookie kwb_theme", () => {
    document.documentElement.setAttribute("data-theme", "DARK");
    renderWithIntl(<TopNav brandName="Titan SEO" themeMode="DARK" user={null} {...LOGOS} />);
    expect(screen.getByRole("img", { name: "Titan SEO" })).toHaveAttribute("src", "/logo-dark.png");

    fireEvent.click(screen.getByRole("button", { name: "Passa al tema chiaro" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "LIGHT");
    expect(document.cookie).toContain("kwb_theme=LIGHT");
    expect(screen.getByRole("img", { name: "Titan SEO" })).toHaveAttribute("src", "/logo-light.png");

    fireEvent.click(screen.getByRole("button", { name: "Passa al tema scuro" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "DARK");
    expect(document.cookie).toContain("kwb_theme=DARK");
  });

  it("c'è anche nelle pagine di accesso e nel menu da telefono", () => {
    document.documentElement.setAttribute("data-theme", "LIGHT");
    navigation.pathname = "/login";
    const { unmount } = renderWithIntl(<TopNav brandName="Titan SEO" themeMode="LIGHT" user={null} />);
    expect(screen.getByRole("button", { name: "Passa al tema scuro" })).toBeInTheDocument();
    unmount();

    navigation.pathname = "/it/pricing";
    renderWithIntl(<TopNav brandName="Titan SEO" themeMode="LIGHT" user={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Apri menu" }));
    expect(screen.getAllByRole("button", { name: "Passa al tema scuro" })).toHaveLength(2);
    navigation.pathname = "/it";
  });

  it("con SYSTEM segue il tema del dispositivo, anche quando cambia a pagina aperta", () => {
    document.documentElement.setAttribute("data-theme", "SYSTEM");
    const device = deviceTheme(true);
    renderWithIntl(<TopNav brandName="Titan SEO" themeMode="SYSTEM" user={null} {...LOGOS} />);
    expect(screen.getByRole("img", { name: "Titan SEO" })).toHaveAttribute("src", "/logo-light.png");
    expect(screen.getByRole("button", { name: "Passa al tema scuro" })).toBeInTheDocument();

    device.change(false);
    expect(screen.getByRole("img", { name: "Titan SEO" })).toHaveAttribute("src", "/logo-dark.png");
    expect(screen.getByRole("button", { name: "Passa al tema chiaro" })).toBeInTheDocument();
  });
});
