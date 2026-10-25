import { expect, test, type Locator, type Page } from "@playwright/test";

// Gate di T-5901 (AC-5901-1…3) e T-5902 (AC-5902-1, AC-5902-2): il movimento della pagina principale. Da 1024 px e senza
// riduzione del movimento una sola finestra ferma cambia scena con la tappa in lettura; con la riduzione del movimento e
// da telefono resta la pagina del modulo 58, ogni tappa con la sua scena; nessun contenuto parte nascosto e lo
// scorrimento non sposta il layout.

function journey(page: Page): Locator {
  return page.locator('section[aria-labelledby="landing-journey"]');
}

/** Le 6 tappe: l'elenco ordinato visibile ai lettori di schermo (l'indicatore della finestra ferma è aria-hidden). */
function steps(page: Page): Locator {
  return journey(page).getByRole("list").getByRole("listitem");
}

/** Il percorso è idratato: il componente ha scelto fra la finestra ferma e la pagina senza movimento. */
async function hydrated(page: Page, motion: "on" | "off") {
  await expect(journey(page).locator("[data-motion]")).toHaveAttribute("data-motion", motion);
}

/** Elementi in position sticky dentro il percorso, con il numero di scene che ognuno contiene. */
async function stickyScenes(page: Page): Promise<number[]> {
  return journey(page).evaluate((root) =>
    [...root.querySelectorAll("*")]
      .filter((node) => getComputedStyle(node).position === "sticky")
      .map((node) => node.querySelectorAll("[data-scene]").length)
  );
}

/** Scorre la pagina fino in fondo a passi, lasciando ai frame il tempo di aggiornare le animazioni legate allo scorrimento. */
async function scrollToBottom(page: Page) {
  for (;;) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, 240);
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
    });
    await page.waitForTimeout(40);
    if (done) break;
  }
  await page.waitForTimeout(300);
}

/** Opacità effettiva (prodotto delle opacità fino a body) dei testi delle 6 tappe e delle 4 schede. */
async function textOpacities(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const texts = [
      ...document.querySelectorAll('section[aria-labelledby="landing-journey"] ol:not([aria-hidden]) > li :is(h3, p)'),
      ...document.querySelectorAll('section[aria-labelledby="landing-more"] article :is(h3, p)'),
    ].filter((node) => !node.closest("[data-scene]"));
    return texts.map((node) => {
      let opacity = 1;
      for (let current: Element | null = node; current && current !== document.body; current = current.parentElement) {
        opacity *= Number(getComputedStyle(current).opacity);
      }
      return opacity;
    });
  });
}

/** 3 testi per tappa (numero, H3 e testo) e 2 per scheda (H3 e testo), tutti con opacità 1. */
const OPAQUE_TEXTS = Array<number>(6 * 3 + 4 * 2).fill(1);

test.describe("pagina principale da computer senza riduzione del movimento", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });

  // covers: AC-5901-1
  test("al testo della quarta tappa una sola finestra ferma mostra la scena dei titoli SEO e l'indicatore segna la 4", async ({
    page,
  }) => {
    await page.goto("/it");
    await hydrated(page, "on");
    await expect(steps(page)).toHaveCount(6);

    await steps(page)
      .nth(3)
      .getByRole("heading", { level: 3 })
      .evaluate((heading) => {
        const box = heading.getBoundingClientRect();
        window.scrollBy(0, box.top + box.height / 2 - window.innerHeight / 2);
      });

    const progress = journey(page).locator('[aria-current="step"]');
    await expect(progress).toHaveCount(1);
    await expect(progress).toHaveText("4");
    await expect(journey(page).locator('[data-scene="titles"]').filter({ visible: true })).toHaveCount(1);
    await expect(journey(page).locator("[data-scene]").filter({ visible: true })).toHaveCount(1);
    expect(await stickyScenes(page)).toEqual([6]);
  });

  // covers: AC-5902-2
  test("dall'inizio alla fine della pagina i layout shift sommano meno di 0,1 e in fondo tappe e schede sono opache", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const shifts = { total: 0 };
      Object.assign(window, { __layoutShifts: shifts });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) shifts.total += (entry as PerformanceEntry & { value: number }).value;
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/it");
    await hydrated(page, "on");
    await scrollToBottom(page);

    const total = await page.evaluate(() => (window as unknown as { __layoutShifts: { total: number } }).__layoutShifts.total);
    expect(total).toBeLessThan(0.1);
    await expect.poll(() => textOpacities(page)).toEqual(OPAQUE_TEXTS);
  });
});

test.describe("pagina principale con la riduzione del movimento", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });

  // covers: AC-5902-1
  test("prima di scorrere nessuna animazione dentro main e i testi di tappe e schede hanno opacity 1", async ({ page }) => {
    await page.goto("/it");
    await hydrated(page, "off");

    const animated = await page.evaluate(() =>
      document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return Boolean(target?.closest("main"));
      }).length
    );
    expect(animated).toBe(0);
    expect(await textOpacities(page)).toEqual(OPAQUE_TEXTS);
  });

  // covers: AC-5901-2
  test("scorrendo /it nessun elemento del percorso è sticky e ogni tappa ha la sua scena visibile accanto al testo", async ({
    page,
  }) => {
    await page.goto("/it");
    await hydrated(page, "off");
    await scrollToBottom(page);

    expect(await stickyScenes(page)).toEqual([]);
    await expect(steps(page)).toHaveCount(6);
    for (const step of await steps(page).all()) {
      const scene = step.locator("[data-scene]");
      await expect(scene).toBeVisible();
      const text = (await step.getByRole("heading", { level: 3 }).boundingBox())!;
      const box = (await scene.boundingBox())!;
      // Accanto: la scena comincia a destra del testo e le due fasce verticali si sovrappongono.
      expect(box.x).toBeGreaterThanOrEqual(text.x + text.width);
      expect(box.y).toBeLessThan(text.y + text.height);
      expect(box.y + box.height).toBeGreaterThan(text.y);
    }
  });
});

test.describe("pagina principale da telefono", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });

  // covers: AC-5901-3
  test("scorrendo fino in fondo ogni tappa ha la sua scena visibile sotto il testo e non c'è l'indicatore delle tappe", async ({
    page,
  }) => {
    await page.goto("/it");
    await hydrated(page, "off");
    await scrollToBottom(page);

    await expect(steps(page)).toHaveCount(6);
    for (const step of await steps(page).all()) {
      const scene = step.locator("[data-scene]");
      await expect(scene).toBeVisible();
      const body = (await step.locator("p:not([aria-hidden])").first().boundingBox())!;
      const box = (await scene.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(body.y + body.height);
    }
    await expect(journey(page).locator('[aria-current="step"]')).toHaveCount(0);
    expect(await stickyScenes(page)).toEqual([]);
  });
});
