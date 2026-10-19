// Gate di T-4701 (AC-4701-1…3): cataloghi a livelli, riconoscimento dello spagnolo dal browser e paese delle ricerche.
import { createFormatter } from "next-intl";
import { describe, expect, it } from "vitest";
import { type CatalogLayer, layerCatalogs, MESSAGES } from "@/lib/i18n/catalogs";
import { resolveLocale, SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { defaultTargeting } from "@/lib/modules/default-targeting";
import en from "@/messages/en.json";
import es419 from "@/messages/es-419.json";

/** Chiavi piatte (a.b.c) di un catalogo. */
function flatKeys(catalog: CatalogLayer, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatKeys(value, path);
  });
}

function valueAt(catalog: CatalogLayer, path: string): string | CatalogLayer | undefined {
  return path.split(".").reduce<string | CatalogLayer | undefined>(
    (node, key) => (node !== undefined && typeof node === "object" ? node[key] : undefined),
    catalog
  );
}

describe("cataloghi di es-ES ed es-419", () => {
  // covers: AC-4701-1
  it("una chiave assente in es-ES si legge in inglese e es-419 sovrascrive solo le sue chiavi", () => {
    // es-ES senza common.close, es-419 con la sola nav.support.
    const spain: CatalogLayer = { common: { saving: "Guardando..." }, nav: { support: "Soporte" } };
    const latam: CatalogLayer = { nav: { support: "Ayuda" } };

    const esES = layerCatalogs(en, spain);
    const esLatam = layerCatalogs(en, spain, latam);

    expect(valueAt(esES, "common.close")).toBe(en.common.close);
    expect(valueAt(esLatam, "common.close")).toBe(en.common.close);
    expect(valueAt(esLatam, "nav.support")).toBe("Ayuda");
    expect(valueAt(esES, "nav.support")).toBe("Soporte");
    expect(valueAt(esLatam, "common.saving")).toBe("Guardando...");
  });

  // covers: AC-4701-1
  it("i cataloghi spagnoli dell'app hanno tutte le chiavi dell'inglese e le differenze di es-419", () => {
    const englishKeys = flatKeys(en).sort();

    expect(flatKeys(MESSAGES["es-ES"]).sort()).toEqual(englishKeys);
    expect(flatKeys(MESSAGES["es-419"]).sort()).toEqual(englishKeys);
    for (const key of flatKeys(es419)) {
      expect(valueAt(MESSAGES["es-419"], key)).toBe(valueAt(es419, key));
    }
  });

  // covers: AC-4701-1
  it("una chiave __proto__ in un livello non tocca il prototipo degli oggetti (CWE-1321)", () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": "yes"}, "nav": {"support": "Ayuda"}}') as CatalogLayer;
    const merged = layerCatalogs(en, hostile);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(valueAt(merged, "nav.support")).toBe("Ayuda");
  });
});

describe("lingua di un visitatore senza cookie", () => {
  // covers: AC-4701-2
  it("es ed es-ES diventano es-ES, America Latina, 419 ed es-US diventano es-419", () => {
    const resolve = (acceptLanguage: string) => resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage }, SUPPORTED_LOCALES);

    expect(["es", "es-AR,es;q=0.9", "es-419", "es-US", "it-IT"].map(resolve)).toEqual(["es-ES", "es-419", "es-419", "es-419", "it"]);
    expect(resolve("es-ES")).toBe("es-ES");
    expect(resolve("es-CO")).toBe("es-419");
    expect(resolve("es-Latn-MX")).toBe("es-419");
    expect(resolve("es-GQ")).toBe("es-ES");
    expect(resolve("fr-FR,es-MX;q=0.5")).toBe("es-419");
  });

  // covers: AC-4701-2
  it("prima di T-4902 il browser e il cookie non portano allo spagnolo, la lingua salvata sì", () => {
    expect(resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage: "es-AR,es;q=0.9,en;q=0.5" })).toBe("en");
    expect(resolveLocale({ userLocale: null, cookieLocale: "es-ES", acceptLanguage: "es" })).toBe("it");
    expect(resolveLocale({ userLocale: "es-419", cookieLocale: "en", acceptLanguage: "it" })).toBe("es-419");
  });
});

describe("paese predefinito delle ricerche senza progetti", () => {
  // covers: AC-4701-3
  it("es-419 prende il paese d'America Latina del browser, altrimenti MX; es-ES è es/ES", () => {
    expect(defaultTargeting("es-419", "es-CO")).toEqual({ languageCode: "es", countryCode: "CO" });
    expect(defaultTargeting("es-419", "es-419")).toEqual({ languageCode: "es", countryCode: "MX" });
    expect(defaultTargeting("es-ES", "es-CO")).toEqual({ languageCode: "es", countryCode: "ES" });
    expect(defaultTargeting("es-419", "en-US,es-PE;q=0.7")).toEqual({ languageCode: "es", countryCode: "PE" });
    expect(defaultTargeting("es-419", null)).toEqual({ languageCode: "es", countryCode: "MX" });
    expect(defaultTargeting("it", "es-CO")).toEqual({ languageCode: "it", countryCode: "IT" });
    expect(defaultTargeting("en", null)).toEqual({ languageCode: "en", countryCode: "US" });
    expect(defaultTargeting(null, "es-CO")).toEqual({ languageCode: "it", countryCode: "IT" });
  });
});

describe("formati di numeri e date", () => {
  it("seguono la lingua dell'utente con il formatter di next-intl", () => {
    const date = new Date("2026-10-19T10:00:00Z");
    const spain = createFormatter({ locale: "es-ES", timeZone: "Europe/Rome" });
    const latam = createFormatter({ locale: "es-419", timeZone: "Europe/Rome" });

    expect(spain.number(12345.5)).toBe("12.345,5");
    expect(latam.number(12345.5)).toBe("12,345.5");
    expect(spain.dateTime(date, { dateStyle: "long" })).toBe("19 de octubre de 2026");
  });
});
