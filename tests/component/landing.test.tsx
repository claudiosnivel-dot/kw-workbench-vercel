import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES } from "@/lib/i18n/catalogs";
import type { OfferedLocale } from "@/lib/i18n/locale";

// Gate di T-5801 (AC-5801-1, AC-5801-2) e T-5802 (AC-5801-1, AC-5802-2): la pagina principale con il percorso in 6
// tappe e le scene dell'app, resa con il catalogo vero di ogni lingua (lo spagnolo a livelli, come in i18n/request.ts).
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { MESSAGES: catalogs } = await import("@/lib/i18n/catalogs");
  const { APP_TIME_ZONE } = await import("@/lib/i18n/locale");
  return {
    getTranslations: async ({ locale, namespace }: { locale: OfferedLocale; namespace: string }) =>
      createTranslator({ locale, messages: catalogs[locale], timeZone: APP_TIME_ZONE, namespace: namespace as never }),
  };
});

const { Landing } = await import("@/components/marketing/landing");

const LOCALES: OfferedLocale[] = ["it", "en", "es-ES", "es-419"];
const INTERACTIVE = "a, button, input, select, textarea, [tabindex]";

async function renderLanding(locale: OfferedLocale) {
  return render(await Landing({ locale }));
}

function sectionOf(heading: HTMLElement): HTMLElement {
  const section = heading.closest("section");
  expect(section).not.toBeNull();
  return section!;
}

function journeySteps(locale: OfferedLocale): HTMLElement[] {
  const heading = screen.getByRole("heading", { level: 2, name: MESSAGES[locale].marketing.landing.journey.title });
  const list = within(sectionOf(heading)).getByRole("list");
  expect(list.tagName).toBe("OL");
  return within(list).getAllByRole("listitem");
}

describe("pagina principale nelle quattro lingue", () => {
  // covers: AC-5801-1
  it.each(LOCALES)("%s: un solo H1, l'H2 del percorso con 6 tappe da un H3 e l'H2 del resto con 4 H3", async (locale) => {
    await renderLanding(locale);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const steps = journeySteps(locale);
    expect(steps).toHaveLength(6);
    for (const step of steps) {
      expect(within(step).getAllByRole("heading", { level: 3 })).toHaveLength(1);
    }

    const more = screen.getByRole("heading", { level: 2, name: MESSAGES[locale].marketing.landing.more.title });
    expect(within(sectionOf(more)).getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });

  // covers: AC-5802-2
  it.each(LOCALES)("%s: nelle scene nessun link, pulsante, campo o tabindex", async (locale) => {
    const { container } = await renderLanding(locale);

    const scenes = [...container.querySelectorAll<HTMLElement>("[data-scene]")];
    expect(scenes).toHaveLength(6);
    expect(scenes.flatMap((scene) => [...scene.querySelectorAll(INTERACTIVE)])).toHaveLength(0);
  });
});

describe("pagina principale in italiano", () => {
  // covers: AC-5801-2
  it("gli H3 delle tappe nominano il percorso in ordine, la pubblicazione cita WordPress e nessun testo dice seed o sezione", async () => {
    const { container } = await renderLanding("it");

    const steps = journeySteps("it");
    const titles = steps.map((step) => within(step).getByRole("heading", { level: 3 }).textContent ?? "");
    const expected = [/parola di partenza/i, /keyword/i, /piano editoriale/i, /titoli SEO/i, /articolo/i, /pubblicazione/i];
    expect(titles).toHaveLength(expected.length);
    titles.forEach((title, index) => expect(title).toMatch(expected[index]));

    const publishText = [...steps[5].querySelectorAll("p")].filter((paragraph) => !paragraph.closest("[data-scene]"));
    expect(publishText.map((paragraph) => paragraph.textContent).join(" ")).toContain("WordPress");

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/seed/i);
    expect(text).not.toMatch(/sezion/i);
  });

  it("i tre link dell'apertura e la chiusura portano a registrazione, prezzi della lingua e accesso", async () => {
    const { container } = await renderLanding("it");

    const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/register", "/it/pricing", "/login", "/register"]);
  });
});

describe("scene dell'app in spagnolo (es-ES)", () => {
  // covers: AC-5802-1
  it("6 scene con aria-hidden, una per tappa nello stesso ordine, e la prima con la parola di partenza dell'esempio", async () => {
    await renderLanding("es-ES");

    const steps = journeySteps("es-ES");
    const scenes = steps.map((step) => step.querySelector<HTMLElement>("[data-scene]"));
    expect(scenes.every((scene) => scene !== null)).toBe(true);
    expect(scenes.map((scene) => scene!.dataset.scene)).toEqual(["start", "keywords", "plan", "titles", "article", "publish"]);
    expect(scenes.every((scene) => scene!.getAttribute("aria-hidden") === "true")).toBe(true);

    const seed = MESSAGES["es-ES"].marketing.landing.scenes.start.seed;
    expect(seed).toBe("zapatillas de running");
    expect(scenes[0]!.textContent).toContain(seed);
  });

  it("le scene di es-419 usano l'esempio d'America Latina, quelle in italiano e in inglese il loro", () => {
    expect(MESSAGES["es-419"].marketing.landing.scenes.start.seed).toBe("tenis para correr");
    expect(MESSAGES.it.marketing.landing.scenes.start.seed).toBe("scarpe running");
    expect(MESSAGES.en.marketing.landing.scenes.start.seed).toBe("running shoes");
  });
});
