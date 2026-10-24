// Gate di T-5701 (AC-5701-4): il tema dell'HTML viene dalle preferenze di chi ha una sessione, poi dal cookie kwb_theme
// solo se vale DARK o LIGHT, altrimenti dal dispositivo (SYSTEM). Con T-5702: il cookie che scrive l'interruttore.
import { describe, expect, it } from "vitest";
import { resolveThemeMode, THEME_COOKIE, themeCookie } from "@/lib/ui/theme";

describe("tema dell'HTML", () => {
  // covers: AC-5701-4
  it("senza utente un cookie kwb_theme con valore PURPLE dà SYSTEM", () => {
    expect(resolveThemeMode({ userTheme: null, cookieTheme: "PURPLE" })).toBe("SYSTEM");
  });

  it("senza utente il cookie vale solo se è esattamente DARK o LIGHT", () => {
    expect(resolveThemeMode({ userTheme: null, cookieTheme: "LIGHT" })).toBe("LIGHT");
    expect(resolveThemeMode({ userTheme: null, cookieTheme: "DARK" })).toBe("DARK");
    expect(resolveThemeMode({ userTheme: null, cookieTheme: "light" })).toBe("SYSTEM");
    expect(resolveThemeMode({ userTheme: null, cookieTheme: 'LIGHT" onload="x' })).toBe("SYSTEM");
    expect(resolveThemeMode({ userTheme: null, cookieTheme: "SYSTEM" })).toBe("SYSTEM");
    expect(resolveThemeMode({ userTheme: null, cookieTheme: "" })).toBe("SYSTEM");
    expect(resolveThemeMode({ userTheme: undefined, cookieTheme: undefined })).toBe("SYSTEM");
  });

  it("con una sessione vale il tema delle preferenze, qualunque sia il cookie", () => {
    expect(resolveThemeMode({ userTheme: "DARK", cookieTheme: "LIGHT" })).toBe("DARK");
    expect(resolveThemeMode({ userTheme: "LIGHT", cookieTheme: "DARK" })).toBe("LIGHT");
    expect(resolveThemeMode({ userTheme: "LIGHT", cookieTheme: null })).toBe("LIGHT");
  });
});

describe("cookie del tema", () => {
  it("si chiama kwb_theme e dura un anno su tutto il sito con SameSite Lax, Secure solo su https", () => {
    expect(THEME_COOKIE).toBe("kwb_theme");
    expect(themeCookie("LIGHT", false)).toBe("kwb_theme=LIGHT; path=/; max-age=31536000; samesite=lax");
    expect(themeCookie("DARK", true)).toBe("kwb_theme=DARK; path=/; max-age=31536000; samesite=lax; secure");
  });
});
