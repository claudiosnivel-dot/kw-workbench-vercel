// Gate di T-4902 (AC-4902-1): un browser messicano senza cookie va da / a /es-419, e le pagine pubbliche hanno gli
// hreflang verso le quattro lingue (/es per es-ES, /es-419 per l'America Latina) e x-default verso /en, anche in sitemap.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "@/app/[lang]/page";
import sitemap from "@/app/sitemap";
import { PAGE_LOCALE_HEADER } from "@/lib/i18n/locale";
import { proxy } from "@/proxy";
import { resetDatabase } from "../helpers/db";

const ORIGIN = "https://example.test";

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, ORIGIN), { headers });
}

const HOME_LANGUAGES = { it: "/it", en: "/en", "es-ES": "/es", "es-419": "/es-419", "x-default": "/en" };

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_URL", ORIGIN);
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pagine pubbliche in spagnolo (T-4902)", () => {
  // covers: AC-4902-1
  it("un visitatore senza cookie con Accept-Language es-MX va da / a /es-419, servita in es-419 con gli hreflang", async () => {
    const redirect = await proxy(request("/", { "accept-language": "es-MX" }));
    expect(redirect.status).toBe(307);
    const location = new URL(redirect.headers.get("location") ?? "");
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/es-419");

    const page = await proxy(request("/es-419", { [PAGE_LOCALE_HEADER]: "it" }));
    expect(page.headers.get("x-middleware-next")).toBe("1");
    expect(page.headers.get(`x-middleware-request-${PAGE_LOCALE_HEADER}`)).toBe("es-419");

    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "es-419" }) });
    expect(metadata.alternates?.canonical).toBe("/es-419");
    expect(metadata.alternates?.languages).toEqual(HOME_LANGUAGES);
    expect(metadata.openGraph?.locale).toBe("es_LA");
  });

  // covers: AC-4902-1
  it("es ed es-ES vanno a /es, servita in es-ES; /es-ES non è una pagina pubblica", async () => {
    for (const acceptLanguage of ["es", "es-ES,es;q=0.9"]) {
      const redirect = await proxy(request("/", { "accept-language": acceptLanguage }));
      expect(new URL(redirect.headers.get("location") ?? "").pathname, acceptLanguage).toBe("/es");
    }

    const page = await proxy(request("/es/pricing"));
    expect(page.headers.get(`x-middleware-request-${PAGE_LOCALE_HEADER}`)).toBe("es-ES");

    const notPublic = await proxy(request("/es-ES"));
    expect(notPublic.status).toBe(307);
    expect(new URL(notPublic.headers.get("location") ?? "").pathname).toBe("/login");

    const metadata = await generateMetadata({ params: Promise.resolve({ lang: "es" }) });
    expect(metadata.alternates?.canonical).toBe("/es");
    expect(metadata.alternates?.languages).toEqual(HOME_LANGUAGES);
    expect(metadata.openGraph?.locale).toBe("es_ES");
  });

  // covers: AC-4902-1
  it("la sitemap ha le pagine spagnole con gli hreflang verso le quattro lingue e x-default verso /en", () => {
    const entries = sitemap();
    const latamPricing = entries.find((entry) => entry.url === `${ORIGIN}/es-419/pricing`);

    expect(entries.map((entry) => entry.url)).toEqual(expect.arrayContaining([`${ORIGIN}/es`, `${ORIGIN}/es-419`, `${ORIGIN}/es/terms`]));
    expect(latamPricing?.alternates?.languages).toEqual({
      it: `${ORIGIN}/it/pricing`,
      en: `${ORIGIN}/en/pricing`,
      "es-ES": `${ORIGIN}/es/pricing`,
      "es-419": `${ORIGIN}/es-419/pricing`,
      "x-default": `${ORIGIN}/en/pricing`,
    });
  });
});
