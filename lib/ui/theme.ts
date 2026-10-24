/**
 * Tema dell'elemento html (T-5701, D-53): chi ha una sessione usa il tema delle preferenze dell'account (T-2901), chi
 * non ha fatto l'accesso quello scelto con l'interruttore delle pagine pubbliche (T-5702) o, senza scelta, quello del
 * dispositivo (SYSTEM: lo decide il CSS con prefers-color-scheme). Modulo puro, senza import: lo usano il layout radice
 * e la barra in alto.
 */

export type ThemeMode = "DARK" | "LIGHT" | "SYSTEM";
export type ChosenThemeMode = Exclude<ThemeMode, "SYSTEM">;

/** Cookie tecnico scritto dal browser con l'interruttore (T-5702): contiene solo DARK o LIGHT. */
export const THEME_COOKIE = "kwb_theme";
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Solo i due letterali ammessi superano il controllo (CWE-20): ogni altro valore del cookie è scartato. */
function isChosenThemeMode(value: unknown): value is ChosenThemeMode {
  return value === "DARK" || value === "LIGHT";
}

export function resolveThemeMode(input: {
  userTheme?: ChosenThemeMode | null;
  cookieTheme?: string | null;
}): ThemeMode {
  if (input.userTheme) return input.userTheme;
  return isChosenThemeMode(input.cookieTheme) ? input.cookieTheme : "SYSTEM";
}

/** Valore di document.cookie per ricordare il tema scelto: un anno su tutto il sito, Secure solo su https. */
export function themeCookie(mode: ChosenThemeMode, secure: boolean): string {
  return `${THEME_COOKIE}=${mode}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure ? "; secure" : ""}`;
}
