import { describe, expect, it } from "vitest";
import { resolveLocale } from "@/lib/i18n/locale";

describe("resolveLocale", () => {
  // covers: AC-1301-1
  it("preferenza dell'utente, poi cookie, poi Accept-Language per peso, poi it; valori fuori whitelist ignorati", () => {
    expect(resolveLocale({ userLocale: "en", cookieLocale: "it", acceptLanguage: "it-IT" })).toBe("en");
    expect(resolveLocale({ userLocale: null, cookieLocale: "en", acceptLanguage: "it" })).toBe("en");
    expect(resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage: "fr-FR,en-US;q=0.8,it;q=0.5" })).toBe(
      "en"
    );
    expect(resolveLocale({ userLocale: null, cookieLocale: "xx", acceptLanguage: "de" })).toBe("it");
  });

  // covers: AC-1301-2
  it("senza utente né cookie ordina Accept-Language per peso e tratta un header malformato o vuoto come assente", () => {
    expect(resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage: "en;q=0.2, it;q=0.9" })).toBe("it");
    expect(() => resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage: "***" })).not.toThrow();
    expect(resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage: "***" })).toBe("it");
    expect(resolveLocale({ userLocale: null, cookieLocale: null, acceptLanguage: "" })).toBe("it");
  });
});
