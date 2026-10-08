// Gate di T-1802 (AC-1802-1…4): pagina prezzi generata dalla stessa configurazione dei piani che applica i limiti.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PricingPage from "@/app/[lang]/pricing/page";
import sitemap from "@/app/sitemap";
import { getEntitlements } from "@/lib/billing/entitlements";
import { setPlansForTesting } from "@/lib/billing/plans";
import { createUserWithSession } from "../helpers/auth";
import { seedSubscription } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { setRequestCookie } from "../helpers/next-cookies";
import { TEST_FREE_LIMITS } from "../helpers/paddle";

// Testo della chiave pricing.comingSoon nel catalogo italiano.
const COMING_SOON = "I prezzi saranno pubblicati a breve.";

/** Piani di prova: free non pubblico, starter e pro pubblici con prezzi e maxProjects noti. */
function testPlans(proMaxProjects = 20) {
  const plan = (id: string, isPublic: boolean, order: number, price: string | null, maxProjects: number) => ({
    id,
    nameKey: `billing.plans.${id}`,
    public: isPublic,
    order,
    displayPrice: price ? { it: { month: price } } : {},
    priceEnv: {},
    limits: { ...TEST_FREE_LIMITS, maxProjects },
  });
  return {
    free: plan("free", false, 0, null, 1),
    starter: plan("starter", true, 1, "9 €", 3),
    pro: plan("pro", true, 2, "29 €", proMaxProjects),
  };
}

async function renderPricing(): Promise<string> {
  return renderToStaticMarkup(await PricingPage({ params: Promise.resolve({ lang: "it" }) }));
}

/** Card dei piani nell'ordine della pagina, dal markup della sola card. */
function planCards(html: string): string[] {
  return html
    .split('data-testid="pricing-plan"')
    .slice(1)
    .map((part) => part.split("</article>")[0]);
}

function limitValue(card: string, key: string): string | null {
  return new RegExp(`data-limit="${key}">([^<]*)<`).exec(card)?.[1] ?? null;
}

function ctaHref(card: string): string | null {
  const anchor = /<a [^>]*data-testid="pricing-cta"[^>]*>/.exec(card)?.[0] ?? "";
  return /href="([^"]*)"/.exec(anchor)?.[1] ?? null;
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_URL", "https://example.test");
  await resetDatabase();
  await setCommercialLaunchForTests("live");
  setPlansForTesting(testPlans());
});

afterEach(() => {
  setPlansForTesting(null);
  vi.unstubAllEnvs();
});

describe("pagina prezzi", () => {
  // covers: AC-1802-1
  it("mostra solo i piani pubblici con i prezzi e i limiti della configurazione", async () => {
    const html = await renderPricing();
    const cards = planCards(html);

    expect(cards).toHaveLength(2);
    // Nomi nell'ordine di order: senza voce nel catalogo il nome è l'id del piano.
    expect(cards.map((card) => /<h2[^>]*>([^<]*)</.exec(card)?.[1])).toEqual(["starter", "pro"]);
    expect(html).toContain("9 €");
    expect(html).toContain("29 €");
    expect(limitValue(cards[0], "maxProjects")).toBe("3");
    expect(limitValue(cards[1], "maxProjects")).toBe("20");
    // Il piano non pubblico (free, nome «Free» dal catalogo) non compare.
    expect(html).not.toContain(">Free<");
  });

  // covers: AC-1802-2
  it("un limite cambiato nella configurazione cambia insieme pagina e diritti del workspace", async () => {
    const owner = await createUserWithSession({ displayName: "t1802-owner" });
    await seedSubscription(owner.workspaceId, { planId: "pro", status: "active" });

    setPlansForTesting(testPlans(25));
    const cards = planCards(await renderPricing());

    expect(limitValue(cards[1], "maxProjects")).toBe("25");
    expect((await getEntitlements(owner.workspaceId)).limits.maxProjects).toBe(25);
  });

  // covers: AC-1802-3
  it("la CTA porta l'anonimo alla registrazione e l'utente autenticato alla fatturazione; la sitemap ha i prezzi", async () => {
    const anonymous = planCards(await renderPricing());
    expect(ctaHref(anonymous[1])).toBe("/register?plan=pro");

    const user = await createUserWithSession({ displayName: "t1802-viewer" });
    setRequestCookie("kwb_session", user.cookie.slice(user.cookie.indexOf("=") + 1));
    const authenticated = planCards(await renderPricing());
    expect(ctaHref(authenticated[1])).toBe("/billing?plan=pro");

    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://example.test/it/pricing");
    expect(urls).toContain("https://example.test/en/pricing");
  });

  // covers: AC-1802-4
  it("con i segnaposto di D-14 o con il lancio in pausa mostra solo l'avviso, senza prezzi né CTA", async () => {
    setPlansForTesting(null);
    const placeholder = await renderPricing();
    expect(placeholder).toContain(COMING_SOON);
    expect(planCards(placeholder)).toHaveLength(0);
    expect(placeholder).not.toContain('data-testid="pricing-cta"');

    setPlansForTesting(testPlans());
    await setCommercialLaunchForTests("paused");
    const paused = await renderPricing();
    expect(paused).toContain(COMING_SOON);
    expect(planCards(paused)).toHaveLength(0);
  });
});
